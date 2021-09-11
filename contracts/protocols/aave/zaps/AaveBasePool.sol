// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "contracts/libraries/Imports.sol";
import {IZap} from "contracts/lpaccount/Imports.sol";
import {IDetailedERC20, IERC20} from "contracts/common/Imports.sol";
import {SafeERC20} from "contracts/libraries/Imports.sol";

abstract contract AaveBasePool is IZap {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address internal immutable UNDERLYER_ADDRESS;
    address internal immutable LENDING_ADDRESS;

    // TODO: think about including the AToken address to conserve gas
    // TODO: consider using IDetailedERC20 as the type instead of address for underlyer

    constructor(address underlyerAddress, address lendingAddress) public {
        UNDERLYER_ADDRESS = underlyerAddress;
        LENDING_ADDRESS = lendingAddress;
    }

    function _deposit(uint256 amount) internal virtual;

    function _withdraw(uint256 lpBalance) internal virtual;

    /// @param amounts array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external override {
        IERC20(UNDERLYER_ADDRESS).safeApprove(LENDING_ADDRESS, 0);
        IERC20(UNDERLYER_ADDRESS).safeApprove(LENDING_ADDRESS, amounts[0]);
        _deposit(amounts[0]);
    }

    /// @param amount LP token amount
    function unwindLiquidity(uint256 amount) external override {
        _withdraw(amount);
    }

    function sortedSymbols() public view override returns (string[] memory) {
        // so we have to hardcode the number here
        string[] memory symbols = new string[](1);
        symbols[0] = IDetailedERC20(UNDERLYER_ADDRESS).symbol();
        return symbols;
    }

    // solhint-disable-next-line no-empty-blocks
    function claim() external override {}
}
