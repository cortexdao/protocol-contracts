// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

/**
 * @title Interface for APY.Finance reserve pools
 * @author APY.Finance
 */
interface IReservePool {
    event ReservePercentageChanged(uint256);

    function setReservePercentage(uint256 reservePercentage_) external;

    function getReserveTopUpValue() external view returns (int256);

    function reservePercentage() external view returns (uint256);
}
