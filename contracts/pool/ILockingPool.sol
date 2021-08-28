// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

interface ILockingPool {
    event AddLiquidityLocked();
    event AddLiquidityUnlocked();
    event RedeemLocked();
    event RedeemUnlocked();

    function emergencyLock() external;

    function emergencyUnlock() external;

    function emergencyLockAddLiquidity() external;

    function emergencyUnlockAddLiquidity() external;

    function emergencyLockRedeem() external;

    function emergencyUnlockRedeem() external;
}
