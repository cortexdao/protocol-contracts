// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

/**
 * @notice For vaults that can be locked and unlocked in emergencies
 */
interface ILockingVault {
    /** @notice Log when deposits are locked */
    event DepositLocked();

    /** @notice Log when deposits are unlocked */
    event DepositUnlocked();

    /** @notice Log when withdrawals are locked */
    event RedeemLocked();

    /** @notice Log when withdrawals are unlocked */
    event RedeemUnlocked();

    /** @notice Lock deposits and withdrawals */
    function emergencyLock() external;

    /** @notice Unlock deposits and withdrawals */
    function emergencyUnlock() external;

    /** @notice Lock deposits */
    function emergencyLockDeposit() external;

    /** @notice Unlock deposits */
    function emergencyUnlockDeposit() external;

    /** @notice Lock withdrawals */
    function emergencyLockRedeem() external;

    /** @notice Unlock withdrawals */
    function emergencyUnlockRedeem() external;
}
