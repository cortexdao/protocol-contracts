// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";

interface IManagedPool {
    event PoolDrained(IERC20 token, uint256 poolUnderlyerBalance);
    event ManagerChanged(address);

    function manager() external returns (address);

    function drain() external returns (uint256);
}
