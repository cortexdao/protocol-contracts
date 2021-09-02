// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "contracts/common/Imports.sol";
import {
    IStableSwap2 as IStableSwap
} from "contracts/protocols/curve/interfaces/IStableSwap2.sol";
import {
    CurveUstConstants
} from "contracts/protocols/curve/allocations/pools/ust.sol";
import {
    ILiquidityGauge
} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";
import {
    CurveBasePoolGauge
} from "contracts/protocols/curve/zaps/CurveBasePoolGauge.sol";

contract UstPoolZap is CurveBasePoolGauge, CurveUstConstants {
    address public constant override SWAP_ADDRESS = META_POOL_ADDRESS;
    address public constant override GAUGE_ADDRESS = LIQUIDITY_GAUGE_ADDRESS;
    address public constant override LP_ADDRESS = LP_TOKEN_ADDRESS;
    uint256 public constant override DENOMINATOR = 10000;
    uint256 public constant override SLIPPAGE = 100;
    uint256 public constant override N_COINS = 2;

    function assetAllocations()
        public
        view
        override
        returns (IAssetAllocation[] memory)
    {
        IAssetAllocation[] memory allocations = new IAssetAllocation[](1);
        allocations[0] = IAssetAllocation(address(0));
        return allocations;
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        IERC20[] memory allocations = new IERC20[](1);
        allocations[0] = IERC20(CRV_ADDRESS);
        return allocations;
    }

    function _getVirtualPrice() internal view override returns (uint256) {
        return IStableSwap(SWAP_ADDRESS).get_virtual_price();
    }

    function _getCoinAtIndex(uint256 i)
        internal
        view
        override
        returns (address)
    {
        return IStableSwap(SWAP_ADDRESS).coins(i);
    }

    function _addLiquidity(uint256[] calldata amounts, uint256 minAmount)
        internal
        override
    {
        uint256[N_COINS] memory amounts_ = [amounts[0], amounts[1]];
        IStableSwap(SWAP_ADDRESS).add_liquidity(amounts_, minAmount);
    }

    function _removeLiquidity(uint256 lpBalance) internal override {
        IStableSwap(SWAP_ADDRESS).remove_liquidity(
            lpBalance,
            [uint256(0), uint256(0)]
        );
    }
}
