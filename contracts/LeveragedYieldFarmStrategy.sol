// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ABDKMath64x64} from "abdk-libraries-solidity/ABDKMath64x64.sol";
import {CErc20} from "./CErc20.sol";
import {Comptroller} from "./Comptroller.sol";
import {IOneSplit} from "./IOneSplit.sol";
import {IStrategy} from "./IStrategy.sol";
import {OneInchSwap} from "./OneInchSwap.sol";
import {DyDxFlashLoan} from "./DyDxFlashLoan.sol";


contract LeveragedYieldFarm is Ownable, IStrategy, DyDxFlashLoan, OneInchSwap {
    using SafeMath for uint256;
    using ABDKMath64x64 for *;
    using SafeERC20 for IERC20;

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

    // Deposit/Withdraw values
    bytes32 private constant _INITIATE = keccak256("INITIATE");
    bytes32 private constant _REBALANCE = keccak256("REBALANCE");
    bytes32 private constant _CLOSE = keccak256("CLOSE");

    uint256 private constant _DAYS_IN_PERIOD = 7;
    uint256 private constant _ETH_MANTISSA = 10**18;
    uint256 private constant _BLOCKS_PER_DAY = 4 * 60 * 24;

    event FlashLoan(address indexed _from, bytes32 indexed _id, uint256 _value);

    uint256 private _positionAmount = 0;

    constructor() public {
        _enterMarkets();
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external override(IStrategy, OneInchSwap) payable {}

    // Do not deposit all your DAI because you must pay flash loan fees
    // Always keep at least 1 DAI in the contract
    function initiatePosition(uint256 initialAmount) public override onlyOwner {
        (uint256 totalAmount, uint256 loanAmount) = _calculateFlashLoanAmounts(
            initialAmount
        );

        bytes memory data = abi.encode(totalAmount, loanAmount, _INITIATE);
        _flashloan(_daiAddress, loanAmount, data);

        _positionAmount = _positionAmount.add(initialAmount);
    }

    function rebalance() external override payable onlyOwner {
        _comptroller.claimComp(address(this));
        uint256 compAmount = _compToken.balanceOf(address(this));

        if (compAmount == 0) return;

        // now swap COMP for DAI using 1inch
        // and initiate position using new DAI
        uint256 additionalAmount = _swap(_compToken, _daiToken, compAmount);

        additionalAmount = additionalAmount.add(address(this).balance);
        initiatePosition(additionalAmount);
    }

    function closePosition() external override onlyOwner {
        (uint256 totalAmount, uint256 loanAmount) = _calculateFlashLoanAmounts(
            _positionAmount
        );

        bytes memory data = abi.encode(totalAmount, loanAmount, _CLOSE);
        _flashloan(_daiAddress, loanAmount, data);

        _comptroller.claimComp(address(this));
        _compToken.transfer(owner(), _compToken.balanceOf(address(this)));
        _daiToken.transfer(owner(), _daiToken.balanceOf(address(this)));
    }

    function _callFunction(
        address,
        Info memory,
        bytes memory data
    ) internal override {
        (uint256 totalAmount, uint256 flashLoanAmount, bytes32 operation) = abi
            .decode(data, (uint256, uint256, bytes32));

        if (operation == _INITIATE) {
            _handleInitiate(totalAmount, flashLoanAmount);
        } else if (operation == _CLOSE) {
            _handleClose();
        } else {
            revert("Farm/unrecognized-operation");
        }
    }

    function _handleInitiate(uint256 totalAmount, uint256 flashLoanAmount)
        internal
        returns (bool)
    {
        _daiToken.approve(_cDaiAddress, totalAmount);

        _cDaiToken.mint(totalAmount);

        _cDaiToken.borrow(flashLoanAmount);

        return true;
    }

    function _handleClose() internal returns (bool) {
        uint256 balance;

        balance = _cDaiToken.borrowBalanceCurrent(address(this));

        _daiToken.approve(address(_cDaiToken), balance);

        _cDaiToken.repayBorrow(balance);

        balance = _cDaiToken.balanceOf(address(this));

        _cDaiToken.redeem(balance);

        return true;
    }

    function withdrawToken(address _tokenAddress) public onlyOwner {
        uint256 balance = IERC20(_tokenAddress).balanceOf(address(this));
        IERC20(_tokenAddress).transfer(owner(), balance);
    }

    function _enterMarkets() internal {
        address[] memory cTokens = new address[](1);
        cTokens[0] = _cDaiAddress;
        uint256[] memory errors = _comptroller.enterMarkets(cTokens);
        if (errors[0] != 0) {
            revert("Comptroller.enterMarkets failed.");
        }
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

    function _calculateFlashLoanAmounts(uint256 initialAmount)
        internal
        returns (uint256, uint256)
    {
        int128 borrowFactor = _calculateBorrowFactor();
        uint256 totalAmount = 1.fromUInt().sub(borrowFactor).inv().mulu(
            initialAmount
        );
        uint256 loanAmount = totalAmount - initialAmount;

        return (totalAmount, loanAmount);
    }
}
