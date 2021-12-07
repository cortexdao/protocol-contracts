// SPDX-License-Identifier: MIT
pragma solidity 0.6.11;

interface IBooster {
    /**
     * @notice deposit into convex, receive a tokenized deposit.
     * Parameter to stake immediately.
     */
    function deposit(
        uint256 _pid,
        uint256 _amount,
        bool _stake
    ) external returns (bool);

    /// @notice burn a tokenized deposit to receive curve lp tokens back
    function withdraw(uint256 _pid, uint256 _amount) external returns (bool);
}
