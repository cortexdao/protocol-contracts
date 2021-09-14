// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IAssetAllocation, IERC20} from "contracts/common/Imports.sol";
import {ApyUnderlyerConstants} from "contracts/protocols/apy.sol";

import {ILendingPool, DataTypes} from "./common/interfaces/ILendingPool.sol";
import {AaveBasePool} from "./common/AaveBasePool.sol";
import {AaveConstants} from "./Constants.sol";

contract AaveUsdcZap is AaveBasePool, AaveConstants, ApyUnderlyerConstants {
    constructor()
        public
        AaveBasePool(USDC_ADDRESS, LENDING_POOL_ADDRESS)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function assetAllocations()
        public
        view
        override
        returns (IAssetAllocation[] memory)
    {
        return new IAssetAllocation[](0);
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        DataTypes.ReserveData memory data =
            ILendingPool(POOL_ADDRESS).getReserveData(UNDERLYER_ADDRESS);
        IERC20[] memory allocations = new IERC20[](2);
        allocations[0] = IERC20(UNDERLYER_ADDRESS);
        allocations[1] = IERC20(data.aTokenAddress);
        return allocations;
    }

    function _deposit(uint256 amount) internal override {
        ILendingPool(POOL_ADDRESS).deposit(
            UNDERLYER_ADDRESS,
            amount,
            address(this),
            0
        );
    }

    function _withdraw(uint256 lpBalance) internal override {
        ILendingPool(POOL_ADDRESS).withdraw(
            UNDERLYER_ADDRESS,
            lpBalance,
            address(this)
        );
    }
}
