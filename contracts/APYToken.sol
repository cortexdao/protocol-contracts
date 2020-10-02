// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Capped.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20Snapshot.sol";

contract APY is
    Initializable,
    OwnableUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    PausableUpgradeSafe,
    ERC20CappedUpgradeSafe,
    ERC20SnapshotUpgradeSafe
{
    uint256 public constant TOTAL_SUPPLY = 1e8;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;

    /* ------------------------------- */

    event AdminChanged(address);

    function initialize(address adminAddress) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();
        __ERC20_init_unchained("APY Governance Token", "APY");
        __ERC20Capped_init_unchained(TOTAL_SUPPLY);
        __ERC20Snapshot_init_unchained();

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    function lock() external onlyOwner {
        _pause();
    }

    function unlock() external onlyOwner {
        _unpause();
    }

    receive() external payable {
        revert("DONT_SEND_ETHER");
    }

    function _mint(address account, uint256 value)
        internal
        virtual
        override(ERC20SnapshotUpgradeSafe, ERC20UpgradeSafe)
    {
        super._mint(account, value);
    }

    function _burn(address account, uint256 value)
        internal
        virtual
        override(ERC20SnapshotUpgradeSafe, ERC20UpgradeSafe)
    {
        super._burn(account, value);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20CappedUpgradeSafe, ERC20UpgradeSafe) {
        super._beforeTokenTransfer(from, to, amount);
    }

    function _transfer(
        address sender,
        address recipient,
        uint256 amount
    ) internal virtual override(ERC20SnapshotUpgradeSafe, ERC20UpgradeSafe) {
        super._transfer(sender, recipient, amount);
    }
}
