pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

// solhint-disable func-name-mixedcase

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IZap} from "contracts/lpaccount/Imports.sol";
import {IAssetAllocation, IDetailedERC20} from "contracts/common/Imports.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    ILiquidityGauge
} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";
import {CurveBasePool} from "contracts/protocols/curve/zaps/CurveBasePool.sol";

abstract contract CurveBasePoolGauge is IZap, CurveBasePool {
    constructor(
        address swapAddress,
        address lpAddress,
        address gaugeAddress,
        uint256 denominator,
        uint256 slippage,
        uint256 nCoins
    )
        public
        CurveBasePool(
            swapAddress,
            lpAddress,
            gaugeAddress,
            denominator,
            slippage,
            nCoins
        ) // solhint-disable-next-line no-empty-blocks
    {}

    function _depositToGauge() internal override {
        ILiquidityGauge liquidityGauge = ILiquidityGauge(GAUGE_ADDRESS);
        uint256 lpBalance = IERC20(LP_ADDRESS).balanceOf(address(this));
        IERC20(LP_ADDRESS).approve(GAUGE_ADDRESS, lpBalance);
        liquidityGauge.deposit(lpBalance);
    }

    function _withdrawFromGauge(uint256 amount)
        internal
        override
        returns (uint256)
    {
        ILiquidityGauge liquidityGauge = ILiquidityGauge(GAUGE_ADDRESS);
        liquidityGauge.withdraw(amount);
        //lpBalance
        return IERC20(LP_ADDRESS).balanceOf(address(this));
    }
}
