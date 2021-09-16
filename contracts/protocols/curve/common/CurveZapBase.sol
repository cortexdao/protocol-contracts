// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath, SafeERC20} from "contracts/libraries/Imports.sol";
import {IZap} from "contracts/lpaccount/Imports.sol";
import {
    IAssetAllocation,
    IDetailedERC20,
    IERC20
} from "contracts/common/Imports.sol";

abstract contract CurveZapBase is IZap {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address internal constant CRV_ADDRESS =
        0xD533a949740bb3306d119CC777fa900bA034cd52;
    address internal constant MINTER_ADDRESS =
        0xd061D61a4d941c39E5453435B6345Dc261C2fcE0;

    address internal immutable SWAP_ADDRESS;
    address internal immutable LP_ADDRESS;
    address internal immutable GAUGE_ADDRESS;
    uint256 internal immutable DENOMINATOR;
    uint256 internal immutable SLIPPAGE;
    uint256 internal immutable N_COINS;

    constructor(
        address swapAddress,
        address lpAddress,
        address gaugeAddress,
        uint256 denominator,
        uint256 slippage,
        uint256 nCoins
    ) public {
        SWAP_ADDRESS = swapAddress;
        LP_ADDRESS = lpAddress;
        GAUGE_ADDRESS = gaugeAddress;
        DENOMINATOR = denominator;
        SLIPPAGE = slippage;
        N_COINS = nCoins;
    }

    /// @param amounts array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external override {
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];

            // if amounts is 0 skip approval
            if (amounts[i] == 0) continue;
            address underlyerAddress = _getCoinAtIndex(i);
            IERC20(underlyerAddress).safeApprove(SWAP_ADDRESS, 0);
            IERC20(underlyerAddress).safeApprove(SWAP_ADDRESS, amounts[i]);
        }

        uint256 minAmount = _calcMinAmount(totalAmount, _getVirtualPrice());
        _addLiquidity(amounts, minAmount);
        _depositToGauge();
    }

    /**
     * @param amount LP token amount
     * @param index underlyer index
     */
    function unwindLiquidity(uint256 amount, uint8 index) external override {
        uint256 lpBalance = _withdrawFromGauge(amount);
        _removeLiquidity(lpBalance, index);
    }

    function claim() external override {
        _claim();
    }

    function sortedSymbols() public view override returns (string[] memory) {
        // N_COINS is not available as a public function
        // so we have to hardcode the number here
        string[] memory symbols = new string[](N_COINS);
        for (uint256 i = 0; i < symbols.length; i++) {
            address underlyerAddress = _getCoinAtIndex(i);
            symbols[i] = IDetailedERC20(underlyerAddress).symbol();
        }
        return symbols;
    }

    function _getVirtualPrice() internal view virtual returns (uint256);

    function _getCoinAtIndex(uint256 i) internal view virtual returns (address);

    function _addLiquidity(uint256[] calldata amounts_, uint256 minAmount)
        internal
        virtual;

    function _removeLiquidity(uint256 lpBalance, uint8 index) internal virtual;

    function _depositToGauge() internal virtual;

    function _withdrawFromGauge(uint256 amount)
        internal
        virtual
        returns (uint256);

    function _claim() internal virtual;

    function _calcMinAmount(uint256 totalAmount, uint256 virtualPrice)
        internal
        view
        returns (uint256)
    {
        uint256 v = totalAmount.mul(1e18).div(virtualPrice);
        return v.mul(DENOMINATOR.sub(SLIPPAGE)).div(DENOMINATOR);
    }
}
