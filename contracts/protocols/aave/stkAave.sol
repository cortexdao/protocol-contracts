// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IAssetAllocation, IERC20} from "contracts/common/Imports.sol";
import {ApyUnderlyerConstants} from "contracts/protocols/apy.sol";

import {IStakedAave} from "./common/interfaces/IStakedAave.sol";
import {AaveBasePool} from "./common/AaveBasePool.sol";

contract StakedAaveZap is AaveBasePool {
    constructor()
        public
        AaveBasePool(
            AAVE_ADDRESS, // underlyer
            STAKED_AAVE_ADDRESS // "pool"
        )
    {} // solhint-disable-line no-empty-blocks

    // solhint-disable-next-line no-empty-blocks
    function claim() external virtual override {}

    function assetAllocations()
        public
        view
        override
        returns (IAssetAllocation[] memory)
    {
        return new IAssetAllocation[](0);
    }

    /// @dev track only unstaked AAVE
    function erc20Allocations() public view override returns (IERC20[] memory) {
        IERC20[] memory allocations = new IERC20[](1);
        allocations[0] = IERC20(UNDERLYER_ADDRESS);
        return allocations;
    }

    function _deposit(uint256 amount) internal override {
        IStakedAave(POOL_ADDRESS).stake(address(this), amount);
    }

    function _withdraw(uint256 amount) internal override {
        IStakedAave stkAave = IStakedAave(POOL_ADDRESS);
        uint256 unstakeWindow = stkAave.UNSTAKE_WINDOW();
        uint256 cooldownStart = stkAave.stakersCooldowns(address(this));
        uint256 cooldownSeconds = stkAave.COOLDOWN_SECONDS();
        uint256 cooldownEnd = cooldownStart.add(cooldownSeconds);
        // solhint-disable not-rely-on-time
        require(block.timestamp > cooldownEnd, "INSUFFICIENT_COOLDOWN");
        if (block.timestamp.sub(cooldownEnd) > unstakeWindow) {
            stkAave.cooldown();
            revert("UNSTAKE_WINDOW_FINISHED");
        }
        // solhint-enable not-rely-on-time
        stkAave.redeem(address(this), amount);
    }
}
