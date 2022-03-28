// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IDetailedERC20} from "contracts/common/Imports.sol";
import {SafeERC20} from "contracts/libraries/Imports.sol";

import {ITimeLocked} from "contracts/rewards/ITimeLocked.sol";
import {IVotingEscrow} from "contracts/dao/IVotingEscrow.sol";
import {IRewardDistributor} from "contracts/dao/IRewardDistributor.sol";
import {DaoToken} from "./DaoToken.sol";

contract DaoTokenMinter {
    address public constant APY_TOKEN_ADDRESS =
        0x95a4492F028aa1fd432Ea71146b433E7B4446611;
    address public constant BLAPY_TOKEN_ADDRESS =
        0xDC9EFf7BB202Fd60dE3f049c7Ec1EfB08006261f;
    address public constant APY_REWARD_DISTRIBUTOR_ADDRESS =
        0x2E11558316df8Dde1130D81bdd8535f15f70B23d;

    address public immutable DAO_TOKEN_ADDRESS;
    address public immutable VE_TOKEN_ADDRESS;

    uint256 internal _CONVERSION_NUMERATOR = 271828182;
    uint256 internal _CONVERSION_DENOMINATOR = 1e8;

    constructor(address daoTokenAddress, address veTokenAddress) public {
        require(daoTokenAddress != address(0), "INVALID_DAO_ADDRESS");
        require(veTokenAddress != address(0), "INVALID_ESCROW_ADDRESS");
        DAO_TOKEN_ADDRESS = daoTokenAddress;
        VE_TOKEN_ADDRESS = veTokenAddress;
    }

    function mintBoostLocked() external {
        require(isAirdropActive(), "AIRDROP_INACTIVE");

        IVotingEscrow blApy = IVotingEscrow(BLAPY_TOKEN_ADDRESS);
        IVotingEscrow.LockedBalance memory locked = blApy.locked(msg.sender);
        // amount is int128 so we do a defensive check
        if (locked.amount <= 0) {
            revert("NO_BOOST_LOCKED_AMOUNT");
        }
        uint256 blApyLockedAmount = uint256(locked.amount);
        uint256 blApyLockEnd = locked.end;

        require(
            ITimeLocked(APY_TOKEN_ADDRESS).lockEnd() <= blApyLockEnd,
            "BOOST_LOCK_ENDS_TOO_EARLY"
        );
        uint256 mintAmount = _convertAmount(blApyLockedAmount);
        DaoToken(DAO_TOKEN_ADDRESS).mint(msg.sender, mintAmount);
        IVotingEscrow(VE_TOKEN_ADDRESS).create_lock_for(
            msg.sender,
            mintAmount,
            blApyLockEnd
        );
    }

    function claimApyAndMint(
        IRewardDistributor.Recipient calldata recipient,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(isAirdropActive(), "AIRDROP_INACTIVE");
        claimApy(recipient, v, r, s);
        mint();
    }

    function claimApy(
        IRewardDistributor.Recipient calldata recipient,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        IRewardDistributor(APY_REWARD_DISTRIBUTOR_ADDRESS).claim(
            recipient,
            v,
            r,
            s
        );
    }

    function mint() public {
        require(isAirdropActive(), "AIRDROP_INACTIVE");

        ITimeLocked apy = ITimeLocked(APY_TOKEN_ADDRESS);
        uint256 unlockedApyBalance = apy.unlockedBalance(msg.sender);

        apy.lockAmount(msg.sender, unlockedApyBalance);
        uint256 mintAmount = _convertAmount(unlockedApyBalance);
        DaoToken(DAO_TOKEN_ADDRESS).mint(msg.sender, mintAmount);
    }

    function isAirdropActive() public view returns (bool) {
        ITimeLocked apyToken = ITimeLocked(APY_TOKEN_ADDRESS);
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp < apyToken.lockEnd();
    }

    /** @dev convert APY token amount to CXD token amount */
    function _convertAmount(uint256 apyAmount) internal view returns (uint256) {
        return
            apyAmount.mul(_CONVERSION_NUMERATOR).div(_CONVERSION_DENOMINATOR);
    }
}
