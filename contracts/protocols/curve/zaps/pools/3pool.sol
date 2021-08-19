// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IZap} from "contracts/interfaces/IZap.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IDetailedERC20} from "contracts/interfaces/IDetailedERC20.sol";
import {
    IStableSwap
} from "contracts/protocols/curve/interfaces/IStableSwap.sol";
import {
    ILiquidityGauge
} from "contracts/protocols/curve/interfaces/ILiquidityGauge.sol";
import {
    Curve3PoolConstants
} from "contracts/protocols/curve/allocations/pools/3pool.sol";

contract Curve3PoolZap is IZap, Curve3PoolConstants {
    using SafeMath for uint256;

    string public constant override NAME = "Curve_3Pool";

    address public constant ALLOCATION_ADDRESS = address(0);

    uint256 private constant _DENOMINATOR = 10000;
    uint256 private constant _SLIPPAGE = 100;

    /// @param amounts array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external override {
        IStableSwap stableSwap = IStableSwap(STABLE_SWAP_ADDRESS);
        uint256 totalAmount = 0;
        uint256[3] memory amounts_;
        for (uint256 i = 0; i < amounts_.length; i++) {
            totalAmount += amounts[i];
            amounts_[i] = amounts[i];
        }

        uint256 v = totalAmount.mul(1e18).div(stableSwap.get_virtual_price());
        uint256 minAmount =
            v.mul(_DENOMINATOR.sub(_SLIPPAGE)).div(_DENOMINATOR);
        // uint256 minAmount = 0;

        // TODO: approve stableswap for deposit amounts
        stableSwap.add_liquidity(amounts_, minAmount);

        ILiquidityGauge liquidityGauge =
            ILiquidityGauge(LIQUIDITY_GAUGE_ADDRESS);

        uint256 lpBalance = IERC20(LP_TOKEN_ADDRESS).balanceOf(address(this));
        // TODO: approve gauge for deposit amount
        liquidityGauge.deposit(lpBalance);
    }

    /// @param amount LP token amount
    // solhint-disable-next-line no-empty-blocks
    function unwindLiquidity(uint256 amount) external override {}

    function sortedSymbols() public view override returns (string[] memory) {
        // N_COINS is not available as a public function
        // so we have to hardcode the number here
        string[] memory symbols = new string[](3);
        for (uint256 i = 0; i < symbols.length; i++) {
            address underlyerAddress =
                IStableSwap(STABLE_SWAP_ADDRESS).coins(i);
            symbols[i] = IDetailedERC20(underlyerAddress).symbol();
        }
        return symbols;
    }
}
