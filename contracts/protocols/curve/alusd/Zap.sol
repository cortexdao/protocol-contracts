// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "contracts/common/Imports.sol";
import {CurveAlUsdConstants} from "./Constants.sol";
import {CurveGaugeZapBase} from "contracts/protocols/curve/common/Imports.sol";

contract AlUsdPoolZap is CurveGaugeZapBase, CurveAlUsdConstants {
    constructor()
        public
        CurveGaugeZapBase(
            address(DEPOSITOR),
            address(LP_TOKEN),
            address(LIQUIDITY_GAUGE),
            10000,
            100,
            4
        ) // solhint-disable-next-line no-empty-blocks
    {}

    function assetAllocations() public view override returns (string[] memory) {
        string[] memory allocationNames = new string[](1);
        allocationNames[0] = NAME;
        return allocationNames;
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        IERC20[] memory allocations = _createErc20AllocationArray(2);
        allocations[4] = ALCX;
        allocations[5] = PRIMARY_UNDERLYER; // alUSD
        return allocations;
    }

    function _getVirtualPrice() internal view override returns (uint256) {
        return META_POOL.get_virtual_price();
    }

    function _getCoinAtIndex(uint256 i)
        internal
        view
        override
        returns (address)
    {
        if (i == 0) {
            return META_POOL.coins(0);
        } else {
            return BASE_POOL.coins(i.sub(1));
        }
    }

    function _addLiquidity(uint256[] calldata amounts, uint256 minAmount)
        internal
        override
    {
        DEPOSITOR.add_liquidity(
            address(META_POOL),
            [amounts[0], amounts[1], amounts[2], amounts[3]],
            minAmount
        );
    }

    function _removeLiquidity(uint256 lpBalance, uint8 index)
        internal
        override
    {
        LP_TOKEN.safeApprove(address(DEPOSITOR), 0);
        LP_TOKEN.safeApprove(address(DEPOSITOR), lpBalance);
        DEPOSITOR.remove_liquidity_one_coin(
            address(META_POOL),
            lpBalance,
            index,
            0
        );
    }

    /**
     * @dev claim protocol-specific rewards;
     *      CRV rewards are always claimed through the minter, in
     *      the `CurveGaugeZapBase` implementation.
     */
    function _claimRewards() internal override {
        LIQUIDITY_GAUGE.claim_rewards();
    }
}
