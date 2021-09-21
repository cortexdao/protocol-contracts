// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "contracts/common/Imports.sol";
import {
    IStableSwap,
    ILiquidityGauge
} from "contracts/protocols/curve/common/interfaces/Imports.sol";
import {
    Curve3PoolConstants
} from "contracts/protocols/curve/3pool/Constants.sol";
import {
    CurveGaugeZapBase
} from "contracts/protocols/curve/common/CurveGaugeZapBase.sol";

contract TestCurveZap is CurveGaugeZapBase {
    string public constant override NAME = "TestCurveZap";

    constructor(
        address swapAddress,
        address lpTokenAddress,
        address liquidityGaugeAddress,
        uint256 denominator,
        uint256 slippage,
        uint256 numOfCoins
    )
        public
        CurveGaugeZapBase(
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

    function assetAllocations() public view override returns (string[] memory) {
        return new string[](0);
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

    function _removeLiquidity(uint256 lpBalance, uint8 index)
        internal
        override
    // solhint-disable-next-line no-empty-blocks
    {

    }
}
