// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

// https://github.com/compound-developers/compound-borrow-examples
// https://gist.github.com/gwmccubbin/e497900261c0a626951061b035f5994d

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {APYStrategy} from "./APYStrategy.sol";
import {CErc20} from "./CErc20.sol";
import {Comptroller} from "./Comptroller.sol";
import {OneInchSwap} from "./OneInchSwap.sol";


contract DAI3Strategy is APYStrategy("DAI3"), OneInchSwap {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using ABDKMath64x64 for *;

    // Mainnet Dai
    // https://etherscan.io/address/0x6b175474e89094c44da98b954eedeac495271d0f#readContract
    address private _daiAddress = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    IERC20 private _daiToken = IERC20(_daiAddress);

    // Mainnet cDai
    // https://etherscan.io/address/0x5d3a536e4d6dbd6114cc1ead35777bab948e3643#readProxyContract
    address private _cDaiAddress = 0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643;
    CErc20 private _cDaiToken = CErc20(_cDaiAddress);

    // Mainnet Comptroller
    // https://etherscan.io/address/0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b#readProxyContract
    address private _comptrollerAddress = 0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B;
    Comptroller private _comptroller = Comptroller(_comptrollerAddress);

    // COMP ERC-20 token
    // https://etherscan.io/token/0xc00e94cb662c3520282e6f5717214004a7f26888
    IERC20 private _compToken = IERC20(
        0xc00e94Cb662C3520282E6f5717214004A7f26888
    );

    uint256 private constant _DAYS_IN_PERIOD = 7;
    uint256 private constant _ETH_MANTISSA = 10**18;
    uint256 private constant _BLOCKS_PER_DAY = 4 * 60 * 24;

    uint256 private _numBorrows = 15;

    event BorrowedDai(
        int128 borrowFactor,
        uint256 liquidity,
        uint256 shortfall,
        uint256 borrowAmount
    );

    constructor() public {
        address[] memory tokens = new address[](1);
        tokens[0] = _daiAddress;
        uint256[] memory proportions = new uint256[](1);
        proportions[0] = 100;
        _setInputAssets(tokens, proportions);
        _enterMarkets();
    }

    function setNumberOfBorrows(uint256 numBorrows) public onlyOwner {
        _numBorrows = numBorrows;
    }

    /**
     * @notice function for testing basic functionality
     * @dev must first send DAI to contract before using this
     */
    function depositAndBorrow(uint256 depositAmount, uint256 borrowAmount)
        external
        returns (uint256)
    {
        _daiToken.approve(_cDaiAddress, depositAmount);
        _cDaiToken.mint(depositAmount);

        _cDaiToken.borrow(borrowAmount);
        uint256 borrows = _cDaiToken.borrowBalanceCurrent(address(this));
        return borrows;
    }

    /**
     * @notice Open cDAI position and do repeated borrowing to
     *         increase cDAI position.
     * @dev must first send DAI to contract before using this
     */
    function borrowDai(uint256 amount) public payable {
        int128 borrowFactor = _calculateBorrowFactor();

        for (uint256 i = 0; i < _numBorrows; i++) {
            _daiToken.approve(_cDaiAddress, amount);

            uint256 error = _cDaiToken.mint(amount);
            require(error == 0, "CErc20.mint Error");

            (
                uint256 error2,
                uint256 liquidity,
                uint256 shortfall
            ) = _comptroller.getAccountLiquidity(address(this));
            require(error2 == 0, "could not get account liquidity");
            require(shortfall == 0, "account underwater");
            require(liquidity > 0, "account has excess collateral");

            uint256 borrowAmount = borrowFactor.mulu(amount);

            uint256 error3 = _cDaiToken.borrow(borrowAmount);
            require(error3 == 0, "could not borrow");

            emit BorrowedDai(borrowFactor, liquidity, shortfall, borrowAmount);

            amount = borrowAmount;
        }
    }

    /// @notice Convert farmed COMP into DAI and add to strategy.
    function rebalance() public returns (bool) {
        _comptroller.claimComp(address(this));
        uint256 compAmount = _compToken.balanceOf(address(this));

        if (compAmount == 0) return true;

        // now swap COMP for DAI using 1inch
        // and initiate position using new DAI
        uint256 additionalAmount = _swap(_compToken, _daiToken, compAmount);
        borrowDai(additionalAmount);

        return true;
    }

    /**
     * @notice Pay back borrowed DAI and close out cDAI position.
     *           The DAI and any remaining COMP is returned to owner.
     */
    function repayBorrow() external returns (bool) {
        uint256 balance;
        uint256 error;

        // return borrowed DAI
        balance = _cDaiToken.borrowBalanceCurrent(address(this));
        _daiToken.approve(address(_cDaiToken), balance);
        error = _cDaiToken.repayBorrow(balance);
        require(error == 0, "CErc20.repayBorrow Error");

        // liquidate collateral for DAI
        balance = _cDaiToken.balanceOf(address(this));
        error = _cDaiToken.redeem(balance);
        require(error == 0, "CErc20.redeem Error");

        // return all assets held by contract to owner
        _comptroller.claimComp(address(this));
        _compToken.transfer(owner(), _compToken.balanceOf(address(this)));
        _daiToken.transfer(owner(), _daiToken.balanceOf(address(this)));

        return true;
    }

    function _enterMarkets() internal {
        address[] memory cTokens = new address[](1);
        cTokens[0] = _cDaiAddress;
        uint256[] memory errors = _comptroller.enterMarkets(cTokens);
        require(errors[0] == 0, "Comptroller.enterMarkets failed.");
    }

    function _calculateBorrowFactor() internal returns (int128) {
        (, uint256 collateralFactorMantissa) = _comptroller.markets(
            _cDaiAddress
        );
        int128 collateralFactor = collateralFactorMantissa.divu(_ETH_MANTISSA);

        uint256 borrowRateMantissa = _cDaiToken.borrowRatePerBlock();
        int128 borrowRate = borrowRateMantissa.divu(_ETH_MANTISSA);

        int128 interestFactorPerDay = borrowRate
            .mul(_BLOCKS_PER_DAY.fromUInt())
            .add(1.fromUInt());
        int128 interestFactorPerPeriod = interestFactorPerDay
            .pow(_DAYS_IN_PERIOD)
            .sub(1.fromUInt());

        int128 borrowFactor = collateralFactor.sub(interestFactorPerPeriod);
        return borrowFactor;
    }
}
