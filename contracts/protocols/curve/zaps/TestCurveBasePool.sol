// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "contracts/common/Imports.sol";
import {
    IStableSwap,
    ILiquidityGauge
} from "contracts/protocols/curve/Imports.sol";
import {
    Curve3PoolConstants
} from "contracts/protocols/curve/allocations/pools/3pool.sol";
import {
    CurveBasePoolGauge
} from "contracts/protocols/curve/zaps/CurveBasePoolGauge.sol";

contract TestCurvePool is CurveBasePoolGauge {
    string public constant override NAME = "TestCurvePool";

    constructor(
        address swapAddress,
        address lpTokenAddress,
        address liquidityGaugeAddress,
        uint256 denominator,
        uint256 slippage,
        uint256 numOfCoins
    )
        public
        CurveBasePoolGauge(
            swapAddress,
            lpTokenAddress,
            liquidityGaugeAddress,
            denominator,
            slippage,
            numOfCoins
        ) // solhint-disable-next-line no-empty-blocks
    {}

    function getSwapAddress() external view returns (address) {
        return SWAP_ADDRESS;
    }

    function getLpTokenAddress() external view returns (address) {
        return LP_ADDRESS;
    }

    function getGaugeAddress() external view returns (address) {
        return GAUGE_ADDRESS;
    }

    function getDenominator() external view returns (uint256) {
        return DENOMINATOR;
    }

    function getSlippage() external view returns (uint256) {
        return SLIPPAGE;
    }

    function getNumberOfCoins() external view returns (uint256) {
        return N_COINS;
    }

    function calcMinAmount(uint256 totalAmount, uint256 virtualPrice)
        external
        view
        returns (uint256)
    {
        return _calcMinAmount(totalAmount, virtualPrice);
    }

    function assetAllocations()
        public
        view
        override
        returns (IAssetAllocation[] memory)
    {
        IAssetAllocation[] memory allocations = new IAssetAllocation[](0);
        return allocations;
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        IERC20[] memory allocations = new IERC20[](0);
        return allocations;
    }

    function _getVirtualPrice() internal view override returns (uint256) {
        return 0;
    }

    function _getCoinAtIndex(uint256 i)
        internal
        view
        override
        returns (address)
    {
        return address(i);
    }

    function _addLiquidity(uint256[] calldata amounts, uint256 minAmount)
        internal
        override
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function _removeLiquidity(uint256 lpBalance)
        internal
        override
    // solhint-disable-next-line no-empty-blocks
    {

    }
}
