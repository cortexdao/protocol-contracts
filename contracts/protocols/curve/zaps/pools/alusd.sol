// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "contracts/common/Imports.sol";
import {
    IStableSwap2 as IStableSwap,
    ILiquidityGauge
} from "contracts/protocols/curve/Imports.sol";
import {
    CurveAlUsdConstants
} from "contracts/protocols/curve/allocations/pools/alusd.sol";
import {
    CurveBasePoolGauge
} from "contracts/protocols/curve/zaps/CurveBasePoolGauge.sol";

contract AlUsdPoolZap is CurveBasePoolGauge, CurveAlUsdConstants {
    constructor()
        public
        CurveBasePoolGauge(
            META_POOL_ADDRESS,
            LP_TOKEN_ADDRESS,
            LIQUIDITY_GAUGE_ADDRESS,
            10000,
            100,
            2
        ) // solhint-disable-next-line no-empty-blocks
    {}

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
        IERC20[] memory allocations = new IERC20[](2);
        allocations[0] = IERC20(CRV_ADDRESS);
        allocations[1] = IERC20(0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF); // ALCX
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
        IStableSwap(SWAP_ADDRESS).add_liquidity(
            [amounts[0], amounts[1]],
            minAmount
        );
    }

    function _removeLiquidity(uint256 lpBalance) internal override {
        IStableSwap(SWAP_ADDRESS).remove_liquidity(
            lpBalance,
            [uint256(0), uint256(0)]
        );
    }

    /**
     * @dev claim protocol-specific rewards;
     *      CRV rewards are always claimed through the minter, in
     *      the `CurveBasePoolGauge` implementation.
     */
    function _claimRewards() internal override {
        ILiquidityGauge liquidityGauge = ILiquidityGauge(GAUGE_ADDRESS);
        liquidityGauge.claim_rewards();
    }
}
