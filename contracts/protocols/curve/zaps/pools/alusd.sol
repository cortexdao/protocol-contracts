// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IZap} from "contracts/interfaces/IZap.sol";
import {IAssetAllocation} from "contracts/interfaces/IAssetAllocation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDetailedERC20} from "contracts/interfaces/IDetailedERC20.sol";
import {
    IStableSwap2
} from "contracts/protocols/curve/interfaces/IStableSwap2.sol";
import {
    ILiquidityGauge
} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";
import {
    CurveAlUsdConstants
} from "contracts/protocols/curve/allocations/pools/alusd.sol";

contract AlUsdPoolZap is IZap, CurveAlUsdConstants {
    using SafeMath for uint256;

    address public constant ALLOCATION_ADDRESS = address(0);
    address public constant CRV_ADDRESS =
        0xD533a949740bb3306d119CC777fa900bA034cd52;

    uint256 private constant _DENOMINATOR = 10000;
    uint256 private constant _SLIPPAGE = 100;

    uint256 public constant N_COINS = 2;

    /// @param amounts array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external override {
        IStableSwap2 stableSwap = IStableSwap2(STABLE_SWAP_ADDRESS);
        uint256 totalAmount = 0;
        uint256[2] memory amounts_;
        for (uint256 i = 0; i < amounts_.length; i++) {
            totalAmount += amounts[i];
            amounts_[i] = amounts[i];
        }

        uint256 v = totalAmount.mul(1e18).div(stableSwap.get_virtual_price());
        uint256 minAmount =
            v.mul(_DENOMINATOR.sub(_SLIPPAGE)).div(_DENOMINATOR);

        for (uint256 i = 0; i < N_COINS; i++) {
            if (amounts_[i] == 0) continue;

            address underlyerAddress =
                IStableSwap2(STABLE_SWAP_ADDRESS).coins(i);
            IERC20(underlyerAddress).approve(STABLE_SWAP_ADDRESS, 0);
            IERC20(underlyerAddress).approve(STABLE_SWAP_ADDRESS, amounts_[i]);
        }
        stableSwap.add_liquidity(amounts_, minAmount);

        ILiquidityGauge liquidityGauge =
            ILiquidityGauge(LIQUIDITY_GAUGE_ADDRESS);

        uint256 lpBalance = IERC20(LP_TOKEN_ADDRESS).balanceOf(address(this));
        IERC20(LP_TOKEN_ADDRESS).approve(LIQUIDITY_GAUGE_ADDRESS, lpBalance);
        liquidityGauge.deposit(lpBalance);
    }

    /// @param amount LP token amount
    function unwindLiquidity(uint256 amount) external override {
        ILiquidityGauge liquidityGauge =
            ILiquidityGauge(LIQUIDITY_GAUGE_ADDRESS);
        liquidityGauge.withdraw(amount);

        uint256 lpBalance = IERC20(LP_TOKEN_ADDRESS).balanceOf(address(this));

        IStableSwap2 stableSwap = IStableSwap2(STABLE_SWAP_ADDRESS);
        stableSwap.remove_liquidity(lpBalance, [uint256(0), uint256(0)]);
    }

    function sortedSymbols() public view override returns (string[] memory) {
        // N_COINS is not available as a public function
        // so we have to hardcode the number here
        string[] memory symbols = new string[](N_COINS);
        for (uint256 i = 0; i < symbols.length; i++) {
            address underlyerAddress =
                IStableSwap2(STABLE_SWAP_ADDRESS).coins(i);
            symbols[i] = IDetailedERC20(underlyerAddress).symbol();
        }
        return symbols;
    }

    function assetAllocations()
        public
        view
        override
        returns (IAssetAllocation[] memory)
    {
        IAssetAllocation[] memory allocations = new IAssetAllocation[](1);
        allocations[0] = IAssetAllocation(ALLOCATION_ADDRESS);
        return allocations;
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        IERC20[] memory allocations = new IERC20[](1);
        allocations[0] = IERC20(CRV_ADDRESS);
        return allocations;
    }
}
