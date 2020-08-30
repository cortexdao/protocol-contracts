// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

// https://github.com/compound-developers/compound-borrow-examples
// https://gist.github.com/gwmccubbin/e497900261c0a626951061b035f5994d

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

interface Structs {
    struct Val {
        uint256 value;
    }

    enum ActionType {
        Deposit, // supply tokens
        Withdraw, // borrow tokens
        Transfer, // transfer balance between accounts
        Buy, // buy an amount of some token (externally)
        Sell, // sell an amount of some token (externally)
        Trade, // trade tokens against another account
        Liquidate, // liquidate an undercollateralized or expiring account
        Vaporize, // use excess tokens to zero-out a completely negative account
        Call // send arbitrary data to an address
    }

    enum AssetDenomination {
        Wei // the amount is denominated in wei
    }

    enum AssetReference {
        Delta // the amount is given as a delta from the current value
    }

    struct AssetAmount {
        bool sign; // true if positive
        AssetDenomination denomination;
        AssetReference ref;
        uint256 value;
    }

    struct ActionArgs {
        ActionType actionType;
        uint256 accountId;
        AssetAmount amount;
        uint256 primaryMarketId;
        uint256 secondaryMarketId;
        address otherAddress;
        uint256 otherAccountId;
        bytes data;
    }

    struct Info {
        address owner; // The address that owns the account
        uint256 number; // A nonce that allows a single address to control many accounts
    }

    struct Wei {
        bool sign; // true if positive
        uint256 value;
    }
}

abstract contract DyDxPool is Structs {
    function operate(Info[] calldata, ActionArgs[] calldata) external virtual;

    function getAccountWei(Info calldata account, uint256 marketId)
        external
        virtual
        view
        returns (Wei memory);
}

abstract contract DyDxFlashLoan is Structs {
    // Mainnet DyDx SoloMargin
    // https://etherscan.io/address/0x1e0447b19bb6ecfdae1e4ae1694b0c3659614e4e
    DyDxPool internal _pool = DyDxPool(
        0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e
    );

    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant SAI = 0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    mapping(address => uint256) public currencies;

    constructor() public {
        currencies[WETH] = 1;
        currencies[SAI] = 2;
        currencies[USDC] = 3;
        currencies[DAI] = 4;
    }

    function callFunction(
        address sender,
        Info calldata accountInfo,
        bytes calldata data
    ) external {
        require(msg.sender == address(_pool), "FlashLoan/only-DyDx-pool");
        _callFunction(sender, accountInfo, data);
    }

    function tokenToMarketId(address token) public view returns (uint256) {
        uint256 marketId = currencies[token];
        require(marketId != 0, "FlashLoan: Unsupported token");
        return marketId - 1;
    }

    // the DyDx will call `callFunction(address sender, Info memory accountInfo, bytes memory data) public`
    // after during `operate` call
    function _flashloan(
        address token,
        uint256 amount,
        bytes memory data
    ) internal {
        IERC20(token).approve(address(_pool), amount + 1);
        Info[] memory infos = new Info[](1);
        ActionArgs[] memory args = new ActionArgs[](3);

        infos[0] = Info(address(this), 0);

        AssetAmount memory wamt = AssetAmount(
            false,
            AssetDenomination.Wei,
            AssetReference.Delta,
            amount
        );
        ActionArgs memory withdraw;
        withdraw.actionType = ActionType.Withdraw;
        withdraw.accountId = 0;
        withdraw.amount = wamt;
        withdraw.primaryMarketId = tokenToMarketId(token);
        withdraw.otherAddress = address(this);

        args[0] = withdraw;

        ActionArgs memory call;
        call.actionType = ActionType.Call;
        call.accountId = 0;
        call.otherAddress = address(this);
        call.data = data;

        args[1] = call;

        ActionArgs memory deposit;
        AssetAmount memory damt = AssetAmount(
            true,
            AssetDenomination.Wei,
            AssetReference.Delta,
            amount + 1
        );
        deposit.actionType = ActionType.Deposit;
        deposit.accountId = 0;
        deposit.amount = damt;
        deposit.primaryMarketId = tokenToMarketId(token);
        deposit.otherAddress = address(this);

        args[2] = deposit;

        _pool.operate(infos, args);
    }

    function _callFunction(
        address sender,
        Info memory accountInfo,
        bytes memory data
    ) internal virtual;
}

contract LeveragedYieldFarm is DyDxFlashLoan, Ownable {
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
    address
        private _comptrollerAddress = 0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B;
    Comptroller private _comptroller = Comptroller(_comptrollerAddress);

    // COMP ERC-20 token
    // https://etherscan.io/token/0xc00e94cb662c3520282e6f5717214004a7f26888
    IERC20 private _compToken = IERC20(
        0xc00e94Cb662C3520282E6f5717214004A7f26888
    );

    // 1proto.eth
    // https://etherscan.io/address/1proto.eth
    IOneSplit private _oneInch = IOneSplit(0x50FDA034C0Ce7a8f7EFDAebDA7Aa7cA21CC1267e); 

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

    // receive() external payable {
    //     revert("Contract can't receive ether.");
    // }

    // Do not deposit all your DAI because you must pay flash loan fees
    // Always keep at least 1 DAI in the contract
    function initiatePosition(uint256 initialAmount)
        public
        onlyOwner
        returns (bool)
    {
        (uint256 totalAmount, uint256 loanAmount) = _calculateFlashLoanAmounts(
            initialAmount
        );

        bytes memory data = abi.encode(totalAmount, loanAmount, _INITIATE);
        _flashloan(_daiAddress, loanAmount, data);

        _positionAmount = _positionAmount.add(initialAmount);

        return true;
    }

    function rebalance() external payable onlyOwner returns (bool) {
        _comptroller.claimComp(address(this));
        uint256 compAmount = _compToken.balanceOf(address(this));

        if (compAmount == 0)
            return true;

        // now swap COMP for DAI using 1inch
        // and initiate position using new DAI
        uint256 additionalAmount = _swap(_compToken, _daiToken, compAmount);
        initiatePosition(additionalAmount);

        return true;
    }

    function closePosition() external onlyOwner returns (bool) {
        (uint256 totalAmount, uint256 loanAmount) = _calculateFlashLoanAmounts(
            _positionAmount
        );

        bytes memory data = abi.encode(totalAmount, loanAmount, _CLOSE);
        _flashloan(_daiAddress, loanAmount, data);

        _comptroller.claimComp(address(this));

        _compToken.transfer(owner(), _compToken.balanceOf(address(this)));

        _daiToken.transfer(owner(), _daiToken.balanceOf(address(this)));

        return true;
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

    function _swap(
        IERC20 fromToken,
        IERC20 destToken,
        uint256 amount
    ) internal returns (uint256) {
        // uint256 flags = 0;
        uint256 flagDisableAllSplitSources = 0x20000000;
        uint256 flagDisableAllWrapSources = 0x40000000;
        uint256 flagDisableMooniswapAll = 0x8000000000000000;
        // enable only Mooniswap
        uint256 flags = flagDisableAllSplitSources + flagDisableAllWrapSources + flagDisableMooniswapAll;

        (uint256 returnAmount, uint256[] memory distribution) = _oneInch
            .getExpectedReturn(fromToken, destToken, amount, 10, flags);

        uint256 ethAmount = 0;
        if (address(fromToken) == address(0)) {
            ethAmount = amount;
        } else {
            IERC20(fromToken).approve(address(_oneInch), amount);
        }

        uint256 receivedAmount = _oneInch.swap{value: ethAmount}(
            fromToken,
            destToken,
            amount,
            returnAmount,
            distribution,
            flags
        );

        return receivedAmount;
    }
}
