// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

/**
 * @title Interface to access APY.Finance's address registry
 * @author APY.Finance
 * @notice The address registry has two important purposes, one which
 * is fairly concrete and another abstract.
 *
 * 1. The registry enables components of the APY.Finance system
 * and external systems to retrieve core addresses reliably
 * even when the functionality may move to a different
 * address.
 *
 * 2. The registry also makes explicit which contracts serve
 * as primary entrypoints for interacting with different
 * components.  Not every contract is registered here, only
 * the ones properly deserving of an identifier.  This helps
 * define explicit boundaries between groups of contracts,
 * each of which is logically cohesive.
 */
interface IAddressRegistryV2 {
    event AddressRegistered(bytes32 id, address _address);
    event AddressDeleted(bytes32 id, address _address);

    function registerAddress(bytes32 id, address address_) external;

    function registerMultipleAddresses(
        bytes32[] calldata ids,
        address[] calldata addresses
    ) external;

    function deleteAddress(bytes32 id) external;

    /**
     * @notice Returns the list of identifiers for core components of
     * the APY.Finance system.
     * @return List of identifiers
     */
    function getIds() external view returns (bytes32[] memory);

    /**
     * @notice Returns the current address represented by an identifier
     * for a core component.
     * @param id Component identifier
     * @return The current address represented by an identifier
     */
    function getAddress(bytes32 id) external view returns (address);

    function tvlManagerAddress() external view returns (address);

    function chainlinkRegistryAddress() external view returns (address);

    function daiPoolAddress() external view returns (address);

    function usdcPoolAddress() external view returns (address);

    function usdtPoolAddress() external view returns (address);

    function mAptAddress() external view returns (address);

    function lpAccountAddress() external view returns (address);

    function lpSafeAddress() external view returns (address);

    function adminSafeAddress() external view returns (address);

    function emergencySafeAddress() external view returns (address);

    function oracleAdapterAddress() external view returns (address);
}
