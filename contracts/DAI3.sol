// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

// https://github.com/compound-developers/compound-borrow-examples
// https://gist.github.com/gwmccubbin/e497900261c0a626951061b035f5994d

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {APYStrategy} from "./APYStrategy.sol";

interface Erc20 {
    function approve(address, uint256) external returns (bool);

    function transfer(address, uint256) external returns (bool);
}

interface CErc20 {
    function mint(uint256) external returns (uint256);

    function borrow(uint256) external returns (uint256);

    function borrowBalanceCurrent(address) external returns (uint256);

    function repayBorrow(uint256) external returns (uint256);

    function borrowRatePerBlock() external view returns (uint256);
}

interface Comptroller {
    function markets(address) external returns (bool, uint256);

    function enterMarkets(address[] calldata)
        external
        returns (uint256[] memory);

    function claimComp(address holder) external;

    function getAccountLiquidity(address)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );
}

contract DAI3Strategy is APYStrategy("DAI3") {
    using SafeMath for uint256;
    using ABDKMath64x64 for *;

    // Mainnet Dai
    // https://etherscan.io/address/0x6b175474e89094c44da98b954eedeac495271d0f#readContract
    address private _daiAddress = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    Erc20 private _dai = Erc20(_daiAddress);

    // Mainnet cDai
    // https://etherscan.io/address/0x5d3a536e4d6dbd6114cc1ead35777bab948e3643#readProxyContract
    address private _cDaiAddress = 0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643;
    CErc20 private _cDai = CErc20(_cDaiAddress);

    // Mainnet Comptroller
    // https://etherscan.io/address/0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b#readProxyContract
    address
        private _comptrollerAddress = 0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B;
    Comptroller private _comptroller = Comptroller(_comptrollerAddress);

    // COMP ERC-20 token
    // https://etherscan.io/token/0xc00e94cb662c3520282e6f5717214004a7f26888
    Erc20 private _compToken = Erc20(
        0xc00e94Cb662C3520282E6f5717214004A7f26888
    );

    uint256 private constant _DAYS_IN_PERIOD = 7;
    uint256 private constant _ETH_MANTISSA = 10**18;
    uint256 private constant _BLOCKS_PER_DAY = 4 * 60 * 24;

    constructor() public {
        address[] memory tokens = new address[](1);
        tokens[0] = _daiAddress;
        uint256[] memory proportions = new uint256[](1);
        proportions[0] = 100;
        _setInputAssets(tokens, proportions);
        _enterMarkets();
    }

    receive() external payable {
        revert("Should not be receiving ETH.");
    }

    /// @dev must first send DAI to contract before using this
    function depositAndBorrow(uint256 depositAmount, uint256 borrowAmount)
        external
        returns (uint256)
    {
        _dai.approve(_cDaiAddress, depositAmount);
        _cDai.mint(depositAmount);

        _cDai.borrow(borrowAmount);
        uint256 borrows = _cDai.borrowBalanceCurrent(address(this));
        return borrows;
    }

    event BorrowedDai(
        int128 borrowFactor,
        uint256 liquidity,
        uint256 shortfall,
        uint256 borrowAmount
    );

    /// @dev must first send DAI to contract before using this
    function borrowDai(uint256 amount, uint256 numBorrows) external payable {
        int128 borrowFactor = _calculateBorrowFactor();

        for (uint256 i = 0; i < numBorrows; i++) {
            _dai.approve(_cDaiAddress, amount);

            uint256 error = _cDai.mint(amount);
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

            uint256 error3 = _cDai.borrow(borrowAmount);
            require(error3 == 0, "could not borrow");

            emit BorrowedDai(borrowFactor, liquidity, shortfall, borrowAmount);

            amount = borrowAmount;
        }
    }

    function repayBorrow(uint256 amount) public returns (bool) {
        _dai.approve(_cDaiAddress, amount);
        uint256 error = _cDai.repayBorrow(amount);

        require(error == 0, "CErc20.repayBorrow Error");
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

        uint256 borrowRateMantissa = _cDai.borrowRatePerBlock();
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
