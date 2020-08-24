pragma solidity ^0.6.6;

// https://github.com/compound-developers/compound-borrow-examples

import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";

interface Erc20 {
    function approve(address, uint256) external returns (bool);

    function transfer(address, uint256) external returns (bool);
}

interface CErc20 {
    function mint(uint256) external returns (uint256);

    function borrow(uint256) external returns (uint256);

    function borrowRatePerBlock() external view returns (uint256);

    function borrowBalanceCurrent(address) external returns (uint256);

    function repayBorrow(uint256) external returns (uint256);
}

interface CEth {
    function mint() external payable;

    function borrow(uint256) external returns (uint256);

    function repayBorrow() external payable;

    function borrowBalanceCurrent(address) external returns (uint256);
}

interface Comptroller {
    function markets(address) external returns (bool, uint256);

    function enterMarkets(address[] calldata)
        external
        returns (uint256[] memory);

    function getAccountLiquidity(address)
        external
        view
        returns (
            uint256,
            uint256,
            uint256
        );

    function claimComp(address holder) external;
}

interface PriceOracle {
    function getUnderlyingPrice(address) external view returns (uint256);
}

contract DAI3Strategy {
    using SafeMath for uint256;
    using ABDKMath64x64 for *;

    // Mainnet Dai
    // https://etherscan.io/address/0x6b175474e89094c44da98b954eedeac495271d0f#readContract
    address daiAddress = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    Erc20 dai = Erc20(daiAddress);

    // Mainnet cDai
    // https://etherscan.io/address/0x5d3a536e4d6dbd6114cc1ead35777bab948e3643#readProxyContract
    address cDaiAddress = 0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643;
    CErc20 cDai = CErc20(cDaiAddress);

    // Mainnet Comptroller
    // https://etherscan.io/address/0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b#readProxyContract
    address comptrollerAddress = 0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B;
    Comptroller comptroller = Comptroller(comptrollerAddress);

    // COMP ERC-20 token
    // https://etherscan.io/token/0xc00e94cb662c3520282e6f5717214004a7f26888
    Erc20 compToken = Erc20(0xc00e94Cb662C3520282E6f5717214004A7f26888);

    // receive() external payable {
    //     revert("Should not be receiving ETH.");
    // }

    /// @dev must first send DAI to contract before using this
    function depositAndBorrow(uint256 depositAmount, uint256 borrowAmount)
        external
        returns (uint256)
    {
        dai.approve(cDaiAddress, depositAmount);
        cDai.mint(depositAmount);

        address[] memory cTokens = new address[](1);
        cTokens[0] = cDaiAddress;
        uint256[] memory errors = comptroller.enterMarkets(cTokens);
        require(errors[0] == 0, "Comptroller.enterMarkets failed.");

        cDai.borrow(borrowAmount);
        uint256 borrows = cDai.borrowBalanceCurrent(address(this));
        return borrows;
    }

    function borrowDai(uint256 amount) external payable returns (uint256) {
        int128 borrowFactor = _calculateBorrowFactor();
        uint256 numLeverage = 1;

        address[] memory cTokens = new address[](1);
        cTokens[0] = cDaiAddress;
        uint256[] memory errors = comptroller.enterMarkets(cTokens);
        require(errors[0] == 0, "Comptroller.enterMarkets failed.");

        for (uint256 i = 0; i < numLeverage; i++) {
            dai.approve(cDaiAddress, amount);

            uint256 error = cDai.mint(amount);
            require(error == 0, "CErc20.mint Error");

            (, uint256 liquidity, uint256 shortfall) = comptroller
                .getAccountLiquidity(address(this));
            require(shortfall == 0, "account underwater");
            require(liquidity > 0, "account has excess collateral");

            uint256 borrowAmount = liquidity
                .fromUInt()
                .mul(borrowFactor)
                .toUInt();

            cDai.borrow(borrowAmount);
        }
        uint256 borrows = cDai.borrowBalanceCurrent(address(this));

        return borrows;
    }

    function _calculateBorrowFactor() internal returns (int128) {
        // Get the collateral factor for our collateral
        (, uint256 collateralFactorMantissa) = comptroller.markets(cDaiAddress);

        // Get the amount of DAI added to your borrow each block
        uint256 borrowRateMantissa = cDai.borrowRatePerBlock();

        // calculate how much interest accumulates over a week
        // 74.25% if interest is 1% per week
        uint256 ethMantissa = 10**18;
        uint256 blocksPerDay = 4 * 60 * 24;
        uint256 daysInPeriod = 7;

        int128 borrowRate = borrowRateMantissa.fromUInt().div(
            ethMantissa.fromUInt()
        );
        int128 interestFactorPerDay = borrowRate
            .mul(blocksPerDay.fromUInt())
            .add(1.fromUInt());
        int128 interestFactorPerPeriod = interestFactorPerDay
            .pow(daysInPeriod)
            .sub(1.fromUInt());
        int128 collateralFactor = collateralFactorMantissa.fromUInt().div(
            ethMantissa.fromUInt()
        );
        int128 borrowFactor = collateralFactor.sub(interestFactorPerPeriod);

        return borrowFactor;
    }

    function repayBorrow(uint256 amount) public returns (bool) {
        dai.approve(cDaiAddress, amount);
        uint256 error = cDai.repayBorrow(amount);

        require(error == 0, "CErc20.repayBorrow Error");
        return true;
    }
}
