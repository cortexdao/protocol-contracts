// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @notice the liquidity gauge, i.e. staking contract, for the stablecoin pool
 */
interface ILiquidityGauge {
    function deposit(uint256 _value) external;

    function deposit(uint256 _value, address _addr) external;

    function withdraw(uint256 _value) external;

    // solhint-disable-next-line func-name-mixedcase
    function claim_rewards() external;

    function balanceOf(address account) external view returns (uint256);
}
