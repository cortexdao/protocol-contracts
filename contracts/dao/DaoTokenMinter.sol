// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IDetailedERC20} from "contracts/common/Imports.sol";
import {SafeERC20} from "contracts/libraries/Imports.sol";

import {ITimeLocked} from "contracts/rewards/ITimeLocked.sol";
import {DaoToken} from "./DaoToken.sol";

contract DaoTokenMinter {
    address public constant APY_TOKEN_ADDRESS =
        0x95a4492F028aa1fd432Ea71146b433E7B4446611;

    address public immutable DAO_TOKEN_ADDRESS;

    constructor(address daoTokenAddress) public {
        DAO_TOKEN_ADDRESS = daoTokenAddress;
    }

    function mint() external {
        require(isAirdropActive(), "AIRDROP_INACTIVE");

        ITimeLocked apyToken = ITimeLocked(APY_TOKEN_ADDRESS);
        uint256 unlockedApyBalance = apyToken.unlockedBalance(msg.sender);

        apyToken.lockAmount(msg.sender, unlockedApyBalance);
        DaoToken(DAO_TOKEN_ADDRESS).mint(msg.sender, unlockedApyBalance);
    }

    function isAirdropActive() public view returns (bool) {
        ITimeLocked apyToken = ITimeLocked(APY_TOKEN_ADDRESS);
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp < apyToken.lockEnd();
    }
}
