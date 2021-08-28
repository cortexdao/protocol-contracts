// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "contracts/interfaces/IAssetAllocation.sol";
import {IStableSwap} from "contracts/protocols/curve/interfaces/IStableSwap.sol";
import {Curve3PoolConstants} from "contracts/protocols/curve/allocations/pools/3pool.sol";
import {CurveBasePool} from "contracts/protocols/curve/zaps/CurveBasePool.sol";

contract Curve3PoolZap is CurveBasePool, Curve3PoolConstants {
    address public constant override SWAP_ADDRESS = STABLE_SWAP_ADDRESS;
    address public constant override GAUGE_ADDRESS = LIQUIDITY_GAUGE_ADDRESS;
    address public constant override LP_ADDRESS = LP_TOKEN_ADDRESS;

    address[] public constant override ALLOCATION_ADDRESSES = [address(0)];

    uint256 public constant override _DENOMINATOR = 10000;
    uint256 public constant override _SLIPPAGE = 100;

    uint256 public constant override N_COINS = 3;
    uint256 public constant override NUM_ALLOCATIONS = 1;
    uint256 public constant override NUM_ERC20_ALLOCATIONS = 1;

    function _getVirtualPrice() internal override returns (uint256) {
        return IStableSwap(STABLE_SWAP_ADDRESS).get_virtual_price();
    }

    function _getCoinAtIndex(uint256 i) internal override returns (address) {
        return IStableSwap(STABLE_SWAP_ADDRESS).coins(i);
    }

    function _addLiquidity(uint256[] calldata amounts, uint256 minAmount)
        internal
        override
    {
        IStableSwap(STABLE_SWAP_ADDRESS).add_liquidity(amounts, minAmount);
    }

    function _removeLiquidity(uint256 lpBalance) internal override {
        IStableSwap(STABLE_SWAP_ADDRESS).remove_liquidity(
            lpBalance,
            [uint256(0), uint256(0), uint256(0)]
        );
    }

    function assetAllocations()
        public
        view
        override
        returns (IAssetAllocation[] memory)
    {
        IAssetAllocation[] memory allocations = new IAssetAllocation[](1);
        allocations[0] = IAssetAllocation(ALLOCATION_ADDRESSES[0]);
        return allocations;
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        IERC20[] memory allocations = new IERC20[](1);
        allocations[0] = IERC20(CRV_ADDRESS);
        return allocations;
    }
}
