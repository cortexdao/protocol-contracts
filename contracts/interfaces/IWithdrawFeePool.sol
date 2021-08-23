// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

/**
 * @title Interface for APY.Finance withdrawal-fee pools
 * @author APY.Finance
 */
interface IWithdrawFeePool {
    event FeePeriodChanged(uint256 feePeriod);
    event FeePercentageChanged(uint256 feePercentage);

    function setFeePeriod(uint256 feePeriod_) external;

    function setFeePercentage(uint256 feePercentage_) external;

    /** @notice seconds since last deposit during which withdrawal fee is charged */
    function feePeriod() external view returns (uint256);

    /** @notice percentage charged for withdrawal fee */
    function feePercentage() external view returns (uint256);

    /**
     * @notice Checks if caller will be charged early withdrawal fee.
     * @return "true" when fee will apply, "false" when it won't.
     */
    function isEarlyRedeem() external view returns (bool);
}
