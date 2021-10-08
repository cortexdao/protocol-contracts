// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "contracts/common/Imports.sol";
import {IMetaPool} from "./IMetaPool.sol";
import {DepositorConstants} from "./Constants.sol";
import {CurveGaugeZapBase} from "contracts/protocols/curve/common/Imports.sol";

abstract contract MetaPoolDepositorZap is
    CurveGaugeZapBase,
    DepositorConstants
{
    IMetaPool internal immutable _META_POOL;

    constructor(
        IMetaPool metapool,
        address lpAddress,
        address gaugeAddress,
        uint256 denominator,
        uint256 slippage
    )
        public
        CurveGaugeZapBase(
            address(DEPOSITOR),
            lpAddress,
            gaugeAddress,
            denominator,
            slippage,
            4
        )
    {
        _META_POOL = metapool;
    }

    function _addLiquidity(uint256[] calldata amounts, uint256 minAmount)
        internal
        override
    {
        DEPOSITOR.add_liquidity(
            address(_META_POOL),
            [amounts[0], amounts[1], amounts[2], amounts[3]],
            minAmount
        );
    }

    function _removeLiquidity(
        uint256 lpBalance,
        uint8 index,
        uint256 minAmount
    ) internal override {
        IERC20(LP_ADDRESS).safeApprove(address(DEPOSITOR), 0);
        IERC20(LP_ADDRESS).safeApprove(address(DEPOSITOR), lpBalance);
        DEPOSITOR.remove_liquidity_one_coin(
            address(_META_POOL),
            lpBalance,
            index,
            minAmount
        );
    }

    function _getVirtualPrice() internal view override returns (uint256) {
        return _META_POOL.get_virtual_price();
    }

    function _getCoinAtIndex(uint256 i)
        internal
        view
        override
        returns (address)
    {
        if (i == 0) {
            return _META_POOL.coins(0);
        } else {
            return BASE_POOL.coins(i.sub(1));
        }
    }
}
