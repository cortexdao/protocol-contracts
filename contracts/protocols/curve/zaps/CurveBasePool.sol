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

abstract contract CurveBasePool is IZap {
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
    uint256 internal immutable FEE_DENOMINATOR;
    uint256 internal immutable PRECISION;

    constructor(
        address swapAddress,
        address lpAddress,
        address gaugeAddress,
        uint256 denominator,
        uint256 slippage,
        uint256 nCoins,
        uint256 feeDenominator,
        uint256 precision
    ) public {
        SWAP_ADDRESS = swapAddress;
        LP_ADDRESS = lpAddress;
        GAUGE_ADDRESS = gaugeAddress;
        DENOMINATOR = denominator;
        SLIPPAGE = slippage;
        N_COINS = nCoins;
        FEE_DENOMINATOR = feeDenominator;
        PRECISION = precision;
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

    /// @param amounts LP token amount
    function unwindLiquidity(uint256[] calldata amounts) external override {
        uint256 lpToUnstake = _calcWithdrawImbalance(amounts);
        uint256 lpBalance = _withdrawFromGauge(lpToUnstake);
        _removeLiquidity(lpBalance);
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

    function _removeLiquidity(uint256 lpBalance) internal virtual;

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

    function _calcWithdrawImbalance(uint256[] memory amounts)
        internal
        view
        returns (uint256)
    {
        require(amounts.length == N_COINS, "INVALID_AMOUNTS");

        uint256[] memory oldBalances = _balances();
        require(oldBalances.length == N_COINS, "INVALID_BALANCES");

        uint256[] memory newBalances = oldBalances;

        uint256 amp = _A();
        uint256 D0 = _getD(oldBalances, amp);

        for (uint256 i = 0; i < N_COINS; i++) {
            newBalances[i] = newBalances[i].sub(amounts[i]);
        }

        uint256 D1 = _getD(newBalances, amp);

        uint256 fee = _fee().mul(N_COINS).div((N_COINS.sub(1)).mul(4));
        uint256[] memory fees = new uint256[](N_COINS);

        for (uint256 j = 0; j < N_COINS; j++) {
            uint256 idealBalance = D1.mul(oldBalances[j]).div(D0);
            uint256 difference =
                idealBalance > newBalances[j]
                    ? idealBalance - newBalances[j]
                    : newBalances[j] - idealBalance;

            fees[j] = fee.mul(difference).div(FEE_DENOMINATOR);
            newBalances[j] = newBalances[j].sub(fees[j]);
        }

        uint256 D2 = _getD(newBalances, amp);

        uint256 totalSupply = IERC20(LP_ADDRESS).totalSupply();
        uint256 tokenAmount = (D0.sub(D2)).mul(totalSupply).div(D0);

        return tokenAmount.add(1);
    }

    function _getDMem(uint256[] memory balances, uint256 amp)
        internal
        view
        virtual
        returns (uint256)
    {
        require(balances.length == N_COINS, "INVALID_BALANCES");

        uint256[] memory xp = _rates();
        require(xp.length == N_COINS, "INVALID_RATES");

        for (uint256 i = 0; i < N_COINS; i++) {
            xp[i] = xp[i].mul(balances[i]).div(PRECISION);
        }

        return _getD(xp, amp);
    }

    function _balances() internal view virtual returns (uint256[] memory);

    function _rates() internal view virtual returns (uint256[] memory);

    function _fee() internal view virtual returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function _A() internal view virtual returns (uint256);

    function _getD(uint256[] memory xp, uint256 amp)
        internal
        view
        virtual
        returns (uint256);
}
