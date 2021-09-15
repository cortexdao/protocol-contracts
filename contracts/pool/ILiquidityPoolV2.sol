// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IDetailedERC20} from "contracts/common/Imports.sol";

/**
 * @title Interface for APY.Finance liquidity pools
 * @author APY.Finance
 * @notice Liquidity pools accept deposits and withdrawals of a single token.
 * APT is minted and burned to track an account's stake in the pool.
 * A Chainlink price aggregator is also set so the total value of the
 * pool can be computed.
 */
interface ILiquidityPoolV2 {
    function underlyer() external view returns (IDetailedERC20);

    function getPoolTotalValue() external view returns (uint256);

    function getValueFromUnderlyerAmount(uint256 underlyerAmount)
        external
        view
        returns (uint256);

    function getUnderlyerPrice() external view returns (uint256);
}
