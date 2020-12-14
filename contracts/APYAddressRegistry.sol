// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";

contract APYAddressRegistry is Initializable, OwnableUpgradeSafe {
    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    address public proxyAdmin;
    mapping(string => address) internal _addresses;

    /* ------------------------------- */

    event AdminChanged(address);
    event AddressChanged(string name, address _address);

    function initialize(address adminAddress) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();

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

    receive() external payable {
        revert("DONT_SEND_ETHER");
    }

    function setAddress(string memory name, address _address) external {
        require(_address != address(0), "Invalid address");
        _addresses[name] = _address;
        emit AddressChanged(name, _address);
    }

    function getAddress(string memory name) public view returns (address) {
        address _address = _addresses[name];
        require(_address != address(0), "Missing address");
        return _address;
    }

    function managerAddress() public view returns (address) {
        return getAddress("manager");
    }

    function chainlinkRegistryAddress() public view returns (address) {
        return getAddress("chainlinkRegistry");
    }

    function daiPoolAddress() public view returns (address) {
        return getAddress("daiPool");
    }

    function usdcPoolAddress() public view returns (address) {
        return getAddress("usdcPool");
    }

    function usdtPoolAddress() public view returns (address) {
        return getAddress("usdtPool");
    }
}
