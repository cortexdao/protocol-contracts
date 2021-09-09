// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAssetAllocation} from "contracts/common/Imports.sol";
import {AaveConstants} from "contracts/protocols/aave/allocations/aave.sol";
import {AaveBasePool} from "contracts/protocols/aave/zaps/AaveBasePool.sol";

// import {ApyUnderlyerConstants} from "constants/protocols/apy.sol";

// import {ILendingPool, DataTypes} from "constants/protocols/aave/interfaces/ILendingPool.sol";

contract AaveDaiZap is AaveBasePool, AaveConstants, ApyUnderlyerConstants {
    constructor()
        public
        AaveBasePool(DAI_ADDRESS, LENDING_POOL_ADDRESS)
    // solhint-disable-next-line no-empty-blocks
    {

    }

    function assetAllocations()
        public
        view
        override
        returns (IAssetAllocation[] memory)
    {
        return [];
    }

    function erc20Allocations() public view override returns (IERC20[] memory) {
        DataTypes.ReserveData memory data = ILendingPool(LENDING_ADDRESS)
            .getReserveData(UNDERLYER_ASSET);
        IERC20[] memory allocations = new IERC20[](2);
        allocations[0] = IERC20(UNDERLYER_ASSET);
        allocations[1] = IERC20(data.aTokenAddress);
        return allocations;
    }

    function _deposit(uint256 amount) internal override {
        ILendingPool(LENDING_ADDRESS).deposit(
            UNDERLYER_ASSET,
            amount,
            address(this),
            0
        );
    }

    function _removeLiquidity(uint256 lpBalance) internal override {
        ILendingPool(LENDING_ADDRESS).withdraw(
            UNDERLYER_ASSET,
            lpBalance,
            address(this)
        );
    }
}
