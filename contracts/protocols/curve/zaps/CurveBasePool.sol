pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

// solhint-disable func-name-mixedcase

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IZap} from "contracts/interfaces/IZap.sol";
import {IAssetAllocation} from "contracts/interfaces/IAssetAllocation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {
    IStableSwap
} from "contracts/protocols/curve/interfaces/IStableSwap.sol";
import {
    ILiquidityGauge
} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";
import {IDetailedERC20} from "contracts/interfaces/IDetailedERC20.sol";

abstract contract CurveBasePool is IZap {
    using SafeMath for uint256;

    address public constant CRV_ADDRESS =
        0xD533a949740bb3306d119CC777fa900bA034cd52;

    function SWAP_ADDRESS() external view virtual returns (address);

    function GAUGE_ADDRESS() external view virtual returns (address);

    function LP_ADDRESS() external view virtual returns (address);

    function ALLOCATION_ADDRESS() external view virtual returns (address);

    function _DENOMINATOR() external view virtual returns (uint256);

    function _SLIPPAGE() external view virtual returns (uint256);

    function N_COINS() external view virtual returns (uint256);

    function NUM_ALLOCATIONS() external view virtual returns (uint256);

    function NUM_ERC20_ALLOCATIONS() external view virtual returns (uint256);

    /// @param amounts array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external override {
        IStableSwap stableSwap = IStableSwap(this.SWAP_ADDRESS());
        uint256 totalAmount = 0;
        uint256[3] memory amounts_;
        for (uint256 i = 0; i < amounts_.length; i++) {
            totalAmount += amounts[i];
            amounts_[i] = amounts[i];
        }

        uint256 v = totalAmount.mul(1e18).div(stableSwap.get_virtual_price());
        uint256 minAmount =
            v.mul(this._DENOMINATOR().sub(this._SLIPPAGE())).div(
                this._DENOMINATOR()
            );

        for (uint256 i = 0; i < this.N_COINS(); i++) {
            if (amounts_[i] == 0) continue;

            address underlyerAddress =
                IStableSwap(this.SWAP_ADDRESS()).coins(i);
            IERC20(underlyerAddress).approve(this.SWAP_ADDRESS(), 0);
            IERC20(underlyerAddress).approve(this.SWAP_ADDRESS(), amounts_[i]);
        }
        stableSwap.add_liquidity(amounts_, minAmount);

        ILiquidityGauge liquidityGauge = ILiquidityGauge(this.GAUGE_ADDRESS());

        uint256 lpBalance = IERC20(this.LP_ADDRESS()).balanceOf(address(this));
        IERC20(this.LP_ADDRESS()).approve(this.GAUGE_ADDRESS(), lpBalance);
        liquidityGauge.deposit(lpBalance);
    }

    /// @param amount LP token amount
    function unwindLiquidity(uint256 amount) external override {
        ILiquidityGauge liquidityGauge = ILiquidityGauge(this.GAUGE_ADDRESS());
        liquidityGauge.withdraw(amount);

        uint256 lpBalance = IERC20(this.LP_ADDRESS()).balanceOf(address(this));

        IStableSwap stableSwap = IStableSwap(this.SWAP_ADDRESS());
        stableSwap.remove_liquidity(
            lpBalance,
            [uint256(0), uint256(0), uint256(0)]
        );
    }

    function sortedSymbols() public view override returns (string[] memory) {
        // N_COINS is not available as a public function
        // so we have to hardcode the number here
        string[] memory symbols = new string[](this.N_COINS());
        for (uint256 i = 0; i < symbols.length; i++) {
            address underlyerAddress =
                IStableSwap(this.SWAP_ADDRESS()).coins(i);
            symbols[i] = IDetailedERC20(underlyerAddress).symbol();
        }
        return symbols;
    }
}
