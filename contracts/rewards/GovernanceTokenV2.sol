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

import {EnumerableSet, SafeMath} from "contracts/libraries/Imports.sol";
import {ITimeLocked} from "./ITimeLocked.sol";

contract GovernanceTokenV2 is
    Initializable,
    OwnableUpgradeSafe,
    ERC20UpgradeSafe,
    ITimeLocked
{
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

    function addLocker(address locker) external override onlyOwner {
        require(false, "NOT_IMPLEMENTED_YET");
    }

    function removeLocker(address locker) external override {
        require(false, "NOT_IMPLEMENTED_YET");
    }

    function lockAmount(address account, uint256 amount) external override {
        require(false, "NOT_IMPLEMENTED_YET");
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
        returns (uint256)
    {
        require(false, "NOT_IMPLEMENTED_YET");
    }

    function isLocker(address account) public view returns (bool) {
        return false;
    }
}
