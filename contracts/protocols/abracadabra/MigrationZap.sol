// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IZap} from "contracts/lpaccount/Imports.sol";
import {SafeMath, SafeERC20} from "contracts/libraries/Imports.sol";
import {IERC20, IDetailedERC20} from "contracts/common/Imports.sol";
import {
    IBooster,
    IBaseRewardPool
} from "contracts/protocols/convex/common/interfaces/Imports.sol";
import {
    IDepositor,
    IMetaPool
} from "contracts/protocols/curve/metapool/Imports.sol";

contract CvxMimToCvx3poolMigration is IZap {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    string public constant override NAME = "cvx-mim-to-cvx3pool";

    uint8 public constant MIM_PID = 40;
    address internal constant BOOSTER_ADDRESS =
        0xF403C135812408BFbE8713b5A23a04b3D48AAE31;
    IERC20 public constant LP_ADDRESS =
        IERC20(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IDepositor public constant DEPOSITOR =
        IDepositor(0xA79828DF1850E8a3A3064576f380D90aECDD3359);
    IMetaPool public constant META_POOL =
        IMetaPool(0x5a6A4D54456819380173272A5E8E9B9904BdF41B);
    IERC20 public constant MIM =
        IERC20(0x99D8a9C45b2ecA8864373A26D1459e3Dff1e17F3);

    uint256 public constant DENOMINATOR = 10000;
    uint256 public constant SLIPPAGE = 100;

    function deployLiquidity(uint256[] calldata) external override {
        revert("NOT_IMPLEMENTED");
    }

    /**
     * @param amount LP token amount
     * @param index unused
     */
    function unwindLiquidity(uint256 amount, uint8 index) external override {
        IBaseRewardPool rewardContract = _getRewardContract();
        // withdraw staked tokens and unwrap to LP tokens;
        // bool is for claiming rewards at the same time
        rewardContract.withdrawAndUnwrap(amount, false);
        uint256 lpBalance = IERC20(LP_ADDRESS).balanceOf(address(this));

        IERC20(LP_ADDRESS).safeApprove(address(DEPOSITOR), 0);
        IERC20(LP_ADDRESS).safeApprove(address(DEPOSITOR), lpBalance);

        int128 mimIndex = 0;

        uint8 decimals = IDetailedERC20(address(MIM)).decimals();
        uint256 minAmount =
            _calcMinAmountUnderlyer(lpBalance, _getVirtualPrice(), decimals);

        DEPOSITOR.remove_liquidity_one_coin(
            address(META_POOL),
            lpBalance,
            mimIndex,
            minAmount
        );
    }

    function claim() external override {
        revert("NOT_IMPLEMENTED");
    }

    function getLpTokenBalance(address)
        external
        view
        override
        returns (uint256)
    {
        revert("NOT_IMPLEMENTED");
    }

    function sortedSymbols() external view override returns (string[] memory) {
        revert("NOT_IMPLEMENTED");
    }

    function assetAllocations() public view override returns (string[] memory) {
        return new string[](0);
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        return new IERC20[](0);
    }

    function _getVirtualPrice() internal view returns (uint256) {
        return META_POOL.get_virtual_price();
    }

    function _getRewardContract() internal view returns (IBaseRewardPool) {
        IBooster booster = IBooster(BOOSTER_ADDRESS);
        IBooster.PoolInfo memory poolInfo = booster.poolInfo(MIM_PID);
        return IBaseRewardPool(poolInfo.crvRewards);
    }

    /**
     * @param lpTokenAmount the amount in the same units as Curve LP token (18 decimals)
     * @param virtualPrice the "price", in 18 decimals, per big token unit of the LP token
     * @param decimals the number of decimals for underlyer token
     * @return required minimum amount of underlyer (in token wei)
     */
    function _calcMinAmountUnderlyer(
        uint256 lpTokenAmount,
        uint256 virtualPrice,
        uint8 decimals
    ) internal pure returns (uint256) {
        // TODO: grab LP Token decimals explicitly?
        uint256 normalizedUnderlyerAmount =
            lpTokenAmount.mul(virtualPrice).div(1e18);
        uint256 underlyerAmount =
            normalizedUnderlyerAmount.mul(10**uint256(decimals)).div(
                10**uint256(18)
            );

        // allow some slippage/MEV
        return underlyerAmount.mul(DENOMINATOR.sub(SLIPPAGE)).div(DENOMINATOR);
    }
}
