// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IDetailedERC20} from "contracts/common/Imports.sol";
import {SafeERC20} from "contracts/libraries/Imports.sol";
import {
    Initializable,
    ERC20UpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    PausableUpgradeSafe,
    AccessControlUpgradeSafe,
    Address as AddressUpgradeSafe,
    SafeMath as SafeMathUpgradeSafe,
    SignedSafeMath as SignedSafeMathUpgradeSafe
} from "contracts/proxy/Imports.sol";
import {IAddressRegistryV2} from "contracts/registry/Imports.sol";

import {IERC4626, IFeePool, ILockingPool, IReservePool} from "./Imports.sol";

import {ICurve3Pool} from "./ICurve3Pool.sol";

/**
 * @notice Helper contract to swap from DAI/USDC/Tether to 3Pool token
 * and then deposit for index tokens.
 */
contract DepositZap {
    using AddressUpgradeSafe for address;
    using SafeMathUpgradeSafe for uint256;
    using SignedSafeMathUpgradeSafe for int256;
    using SafeERC20 for IDetailedERC20;

    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;

    address public constant CURVE_3POOL =
        0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;
    address public constant CURVE_3CRV =
        0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490;

    address public immutable indexToken;

    constructor(address indexToken_) public {
        indexToken = indexToken_;
    }

    function deposit(uint256 amount, uint8 index) external {
        _addLiquidityOneCoin(amount, index, 0);
        uint256 lpAmount = IDetailedERC20(CURVE_3CRV).balanceOf(address(this));
        IERC4626(indexToken).deposit(lpAmount, msg.sender);
    }

    function _addLiquidityOneCoin(
        uint256 amount,
        uint256 index,
        uint256 minAmount
    ) internal {
        uint256[3] memory amounts;
        amounts[index] = amount;
        _addLiquidity(amounts, 0);
    }

    function _addLiquidity(uint256[3] memory amounts, uint256 minAmount)
        internal
    {
        ICurve3Pool(CURVE_3POOL).add_liquidity(
            [amounts[0], amounts[1], amounts[2]],
            minAmount
        );
    }

    function removeLiquidityOneCoin(
        uint256 lpAmount,
        uint8 index,
        uint256 minAmount
    ) external {
        require(index < 3, "INVALID_INDEX");
        ICurve3Pool(CURVE_3POOL).remove_liquidity_one_coin(
            lpAmount,
            index,
            minAmount
        );
    }
}
