// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {SafeMath} from "contracts/imports/LibraryImports.sol";

import {IERC20, INameIdentifier} from "contracts/imports/CommonImports.sol";

import {
    ImmutableAssetAllocation
} from "contracts/imports/TvlManagerImports.sol";

import {DataTypes} from "../DataTypes.sol";
import {ILendingPool} from "../interfaces/ILendingPool.sol";
import {ApyUnderlyerConstants} from "contracts/protocols/apy.sol";

/**
 * @title Periphery Contract for the Aave lending pool
 * @author APY.Finance
 * @notice This contract enables the APY.Finance system to retrieve the balance
 * of an underlyer of an Aave lending token. The balance is used as part
 * of the Chainlink computation of the deployed TVL.  The primary
 * `getUnderlyerBalance` function is invoked indirectly when a
 * Chainlink node calls `balanceOf` on the APYAssetAllocationRegistry.
 */
contract AaveAllocationBase {
    using SafeMath for uint256;

    /**
     * @notice Returns the balance of an underlying token represented by
     * an account's aToken balance
     * @dev aTokens represent the underlyer amount at par (1-1), growing with interest.
     * @param underlyer address of the underlying asset of the aToken
     * @param pool Aave lending pool
     * @return balance
     */
    function getUnderlyerBalance(
        address account,
        ILendingPool pool,
        address underlyer
    ) public view returns (uint256) {
        require(account != address(0), "INVALID_ACCOUNT");
        require(address(pool) != address(0), "INVALID_POOL");
        require(underlyer != address(0), "INVALID_UNDERLYER");

        DataTypes.ReserveData memory reserve = pool.getReserveData(underlyer);
        address aToken = reserve.aTokenAddress;
        // No unwrapping of aTokens are needed, as `balanceOf`
        // automagically reflects the accrued interest and
        // aTokens convert 1:1 to the underlyer.
        return IERC20(aToken).balanceOf(account);
    }
}

abstract contract AaveConstants is INameIdentifier {
    string public constant override NAME = "aave";

    address public constant LENDING_POOL_ADDRESS =
        0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9;
}

contract AaveStableCoinAllocation is
    AaveAllocationBase,
    ImmutableAssetAllocation,
    AaveConstants,
    ApyUnderlyerConstants
{
    function balanceOf(address account, uint8 tokenIndex)
        external
        view
        override
        returns (uint256)
    {
        address underlyer = addressOf(tokenIndex);
        return
            super.getUnderlyerBalance(
                account,
                ILendingPool(LENDING_POOL_ADDRESS),
                underlyer
            );
    }

    function _getTokenData()
        internal
        pure
        override
        returns (TokenData[] memory)
    {
        TokenData[] memory tokens = new TokenData[](3);
        tokens[0] = TokenData(DAI_ADDRESS, DAI_SYMBOL, DAI_DECIMALS);
        tokens[1] = TokenData(USDC_ADDRESS, USDC_SYMBOL, USDC_DECIMALS);
        tokens[2] = TokenData(USDT_ADDRESS, USDT_SYMBOL, USDT_DECIMALS);
        return tokens;
    }
}
