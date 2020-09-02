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


contract LeveragedYieldFarmStrategy is
    Ownable,
    IStrategy,
    DyDxFlashLoan,
    OneInchSwap
{
    using SafeMath for uint256;
    using ABDKMath64x64 for *;
    using SafeERC20 for IERC20;

    address public manager;

    uint256 private _positionAmount = 0;

    bytes32 private constant _ENTER = keccak256("ENTER");
    bytes32 private constant _EXIT = keccak256("EXIT");

    uint256 private constant _DAYS_IN_PERIOD = 7;
    uint256 private constant _ETH_MANTISSA = 10**18;
    uint256 private constant _BLOCKS_PER_DAY = 4 * 60 * 24;

    IERC20 private _daiToken;
    IERC20 private _compToken;
    CErc20 private _cDaiToken;
    Comptroller private _comptroller;

    event FlashLoan(address indexed _from, bytes32 indexed _id, uint256 _value);

    constructor(
        address daiAddress,
        address cDaiAddress,
        address compAddress,
        address comptrollerAddress
    ) public {
        _daiToken = IERC20(daiAddress);
        _cDaiToken = CErc20(cDaiAddress);
        _compToken = IERC20(compAddress);
        _comptroller = Comptroller(comptrollerAddress);
        _enterMarkets();
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external override(IStrategy, OneInchSwap) payable {}

    function enter() external override payable onlyManager {
        uint256 amount = _swap(IERC20(address(0)), _daiToken, msg.value);
        _addToDaiPosition(amount);
    }

    function _addToDaiPosition(uint256 amount) internal {
        (uint256 totalAmount, uint256 loanAmount) = _calculateFlashLoanAmounts(
            amount
        );

        bytes memory data = abi.encode(totalAmount, loanAmount, _ENTER);
        _flashloan(_daiToken, loanAmount, data);

        _positionAmount = _positionAmount.add(amount);
    }

    function reinvest() external override payable onlyManager {
        _comptroller.claimComp(address(this));
        uint256 compAmount = _compToken.balanceOf(address(this));

        if (compAmount == 0) return;

        // now swap COMP for DAI using 1inch
        // and initiate position using new DAI
        uint256 additionalAmount = _swap(_compToken, _daiToken, compAmount);

        additionalAmount = additionalAmount.add(
            _swap(IERC20(address(0)), _daiToken, address(this).balance)
        );
        _addToDaiPosition(additionalAmount);
    }

    function exit() external override onlyManager {
        (uint256 totalAmount, uint256 loanAmount) = _calculateFlashLoanAmounts(
            _positionAmount
        );

        bytes memory data = abi.encode(totalAmount, loanAmount, _EXIT);
        _flashloan(_daiToken, loanAmount, data);

        _comptroller.claimComp(address(this));
        _compToken.transfer(owner(), _compToken.balanceOf(address(this)));
        _daiToken.transfer(owner(), _daiToken.balanceOf(address(this)));
    }

    /// @dev called by admin during deployment
    function setManagerAddress(address _manager) public onlyOwner {
        manager = _manager;
    }

    function _callFunction(
        address,
        Info memory,
        bytes memory data
    ) internal override {
        (uint256 totalAmount, uint256 flashLoanAmount, bytes32 operation) = abi
            .decode(data, (uint256, uint256, bytes32));

        if (operation == _ENTER) {
            _handleEnter(totalAmount, flashLoanAmount);
        } else if (operation == _EXIT) {
            _handleExit();
        } else {
            revert("Farm/unrecognized-operation");
        }
    }

    function _handleEnter(uint256 totalAmount, uint256 flashLoanAmount)
        internal
        returns (bool)
    {
        _daiToken.approve(address(_cDaiToken), totalAmount);

        _cDaiToken.mint(totalAmount);

        _cDaiToken.borrow(flashLoanAmount);

        return true;
    }

    function _handleExit() internal returns (bool) {
        uint256 balance;

        balance = _cDaiToken.borrowBalanceCurrent(address(this));

        _daiToken.approve(address(_cDaiToken), balance);

        _cDaiToken.repayBorrow(balance);

        balance = _cDaiToken.balanceOf(address(this));

        _cDaiToken.redeem(balance);

        return true;
    }

    function _enterMarkets() internal {
        address[] memory cTokens = new address[](1);
        cTokens[0] = address(_cDaiToken);
        uint256[] memory errors = _comptroller.enterMarkets(cTokens);
        if (errors[0] != 0) {
            revert("Comptroller.enterMarkets failed.");
        }
    }

    function _calculateBorrowFactor() internal returns (int128) {
        (, uint256 collateralFactorMantissa) = _comptroller.markets(
            address(_cDaiToken)
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
        uint256 loanAmount = totalAmount.sub(initialAmount);

        return (totalAmount, loanAmount);
    }

    modifier onlyManager {
        require(msg.sender == manager, "Only manager can call");
        _;
    }
}
