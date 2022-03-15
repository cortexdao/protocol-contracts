// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {
    OwnableUpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import {
    Initializable
} from "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import {
    ERC20UpgradeSafe
} from "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";

import {EnumerableSet} from "contracts/libraries/Imports.sol";
import {SafeMath as SafeMathUpgradeSafe} from "contracts/proxy/Imports.sol";
import {ITimeLocked} from "./ITimeLocked.sol";

contract GovernanceTokenV2 is
    Initializable,
    OwnableUpgradeSafe,
    ERC20UpgradeSafe,
    ITimeLocked
{
    using SafeMathUpgradeSafe for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    // V1
    address public proxyAdmin;

    // V2
    /** @notice expiry of timelock in unix time */
    uint256 public override lockEnd;
    /** @dev addresses allowed to timelock user balances */
    EnumerableSet.AddressSet private _lockers;
    mapping(address => uint256) private _lockedAmount;

    /* ------------------------------- */

    event AdminChanged(address);

    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    modifier onlyLocker() {
        require(isLocker(msg.sender), "LOCKER_ONLY");
        _;
    }

    receive() external payable {
        revert("DONT_SEND_ETHER");
    }

    /** @dev V1 init, copied unchanged from V1 contract */
    function initialize(address adminAddress, uint256 totalSupply)
        external
        initializer
    {
        require(adminAddress != address(0), "INVALID_ADMIN");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ERC20_init_unchained("APY Governance Token", "APY");

        // initialize impl-specific storage
        setAdminAddress(adminAddress);

        _mint(msg.sender, totalSupply);
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function setLockEnd(uint256 lockEnd_) external override onlyOwner {
        lockEnd = lockEnd_;
    }

    function addLocker(address account) external override onlyOwner {
        _lockers.add(account);
        emit LockerAdded(account);
    }

    function removeLocker(address locker) external override onlyOwner {
        _lockers.remove(locker);
        emit LockerRemoved(locker);
    }

    function lockAmount(address account, uint256 amount)
        external
        override
        onlyLocker
    {
        require(
            amount <= unlockedAmount(account),
            "AMOUNT_EXCEEDS_UNLOCKED_BALANCE"
        );
        _lockedAmount[account] = _lockedAmount[account].add(amount);
    }

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    function unlockedAmount(address account)
        public
        view
        override
        returns (uint256 amount)
    {
        if (block.timestamp > lockEnd) {
            amount = balanceOf(account);
        } else {
            amount = balanceOf(account).sub(_lockedAmount[account]);
        }
    }

    function isLocker(address account) public view returns (bool) {
        return _lockers.contains(account);
    }

    /**
     * @dev This hook will block transfers until block timestamp
     * is past `lockEnd`.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        super._beforeTokenTransfer(from, to, amount);
        require(amount <= unlockedAmount(from), "LOCKED_BALANCE");
    }
}
