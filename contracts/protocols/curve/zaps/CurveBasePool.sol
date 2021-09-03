pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "contracts/libraries/Imports.sol";
import {IZap} from "contracts/lpaccount/Imports.sol";
import {
    IAssetAllocation,
    IDetailedERC20,
    IERC20
} from "contracts/common/Imports.sol";

abstract contract CurveBasePool is IZap {
    using SafeMath for uint256;

    address internal constant CRV_ADDRESS =
        0xD533a949740bb3306d119CC777fa900bA034cd52;

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

    function _getVirtualPrice() internal view virtual returns (uint256);

    function _getCoinAtIndex(uint256 i) internal view virtual returns (address);

    function _addLiquidity(uint256[] calldata amounts_, uint256 minAmount)
        internal
        virtual;

    function _removeLiquidity(uint256 lpBalance) internal virtual;

    function _depositToGauge() internal virtual;

    function _withdrawFromGauge(uint256 amount)
        internal
        virtual
        returns (uint256);

    /// @param amounts array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external override {
        uint256 totalAmount = 0;
        uint256[3] memory amounts_;
        for (uint256 i = 0; i < amounts_.length; i++) {
            totalAmount += amounts[i];
            amounts_[i] = amounts[i];
        }

        uint256 v = totalAmount.mul(1e18).div(_getVirtualPrice());
        uint256 minAmount = v.mul(DENOMINATOR.sub(SLIPPAGE)).div(DENOMINATOR);

        for (uint256 i = 0; i < N_COINS; i++) {
            if (amounts_[i] == 0) continue;

            address underlyerAddress = _getCoinAtIndex(i);
            IERC20(underlyerAddress).approve(SWAP_ADDRESS, 0);
            IERC20(underlyerAddress).approve(SWAP_ADDRESS, amounts_[i]);
        }
        _addLiquidity(amounts, minAmount);
        _depositToGauge();
    }

    /// @param amount LP token amount
    function unwindLiquidity(uint256 amount) external override {
        uint256 lpBalance = _withdrawFromGauge(amount);
        _removeLiquidity(lpBalance);
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
}
