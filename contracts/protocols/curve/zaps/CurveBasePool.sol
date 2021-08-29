pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

// solhint-disable func-name-mixedcase

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IZap} from "contracts/lpaccount/Imports.sol";
import {IAssetAllocation, IDetailedERC20} from "contracts/common/Imports.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILiquidityGauge} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";

abstract contract CurveBasePool is IZap {
    using SafeMath for uint256;

    address public constant CRV_ADDRESS =
        0xD533a949740bb3306d119CC777fa900bA034cd52;

    function SWAP_ADDRESS() external pure virtual returns (address);

    function GAUGE_ADDRESS() external pure virtual returns (address);

    function LP_ADDRESS() external pure virtual returns (address);

    function _DENOMINATOR() external pure virtual returns (uint256);

    function _SLIPPAGE() external pure virtual returns (uint256);

    function N_COINS() external pure virtual returns (uint256);

    function _getVirtualPrice() internal view virtual returns (uint256);

    function _getCoinAtIndex(uint256 i) internal view virtual returns (address);

    function _addLiquidity(uint256[] calldata amounts_, uint256 minAmount)
        internal
        virtual;

    function _removeLiquidity(uint256 lpBalance) internal virtual;

    /// @param amounts array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external override {
        uint256 totalAmount = 0;
        uint256[3] memory amounts_;
        for (uint256 i = 0; i < amounts_.length; i++) {
            totalAmount += amounts[i];
            amounts_[i] = amounts[i];
        }

        uint256 v = totalAmount.mul(1e18).div(_getVirtualPrice());
        uint256 minAmount = v
            .mul(this._DENOMINATOR().sub(this._SLIPPAGE()))
            .div(this._DENOMINATOR());

        for (uint256 i = 0; i < this.N_COINS(); i++) {
            if (amounts_[i] == 0) continue;

            address underlyerAddress = _getCoinAtIndex(i);
            IERC20(underlyerAddress).approve(this.SWAP_ADDRESS(), 0);
            IERC20(underlyerAddress).approve(this.SWAP_ADDRESS(), amounts_[i]);
        }
        _addLiquidity(amounts, minAmount);

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
        _removeLiquidity(lpBalance);
    }

    function sortedSymbols() public view override returns (string[] memory) {
        // N_COINS is not available as a public function
        // so we have to hardcode the number here
        string[] memory symbols = new string[](this.N_COINS());
        for (uint256 i = 0; i < symbols.length; i++) {
            address underlyerAddress = _getCoinAtIndex(i);
            symbols[i] = IDetailedERC20(underlyerAddress).symbol();
        }
        return symbols;
    }
}
