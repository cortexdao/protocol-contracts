// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {MetaPoolToken} from "../MetaPoolToken.sol";
import {PoolTokenV2} from "../PoolTokenV2.sol";

/**
 * @dev Proxy contract to test internal variables and functions
 * Should not be used other than in test files!
 */
contract TestMetaPoolToken is MetaPoolToken {
    /// @dev useful for changing supply during calc tests
    function testMint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    /// @dev useful for changing supply during calc tests
    function testBurn(address account, uint256 amount) public {
        _burn(account, amount);
    }

    function testFundLp(PoolTokenV2[] memory pools, uint256[] memory amounts)
        public
    {
        _fundLp(pools, amounts);
    }

    function testWithdrawLp(
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) public {
        _withdrawLp(pools, amounts);
    }

    function testMultipleMintAndTransfer(
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) public {
        _multipleMintAndTransfer(pools, amounts);
    }

    function testMintAndTransfer(
        PoolTokenV2 pool,
        uint256 mintAmount,
        uint256 transferAmount
    ) public {
        _mintAndTransfer(pool, mintAmount, transferAmount);
    }

    function testMultipleBurnAndTransfer(
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) public {
        _multipleBurnAndTransfer(pools, amounts);
    }

    function testBurnAndTransfer(
        PoolTokenV2 pool,
        address lpSafe,
        uint256 burnAmount,
        uint256 transferAmount
    ) public {
        _burnAndTransfer(pool, lpSafe, burnAmount, transferAmount);
    }

    function testRegisterPoolUnderlyers(PoolTokenV2[] memory pools) public {
        _registerPoolUnderlyers(pools);
    }

    function testGetTvl() public view returns (uint256) {
        return _getTvl();
    }

    function testCalculateDeltas(
        PoolTokenV2[] memory pools,
        uint256[] memory amounts
    ) public view returns (uint256[] memory) {
        return _calculateDeltas(pools, amounts);
    }

    function testCalculateDelta(
        uint256 amount,
        uint256 tokenPrice,
        uint8 decimals
    ) public view returns (uint256) {
        return _calculateDelta(amount, tokenPrice, decimals);
    }

    function testGetFundAmounts(int256[] memory amounts)
        public
        pure
        returns (uint256[] memory)
    {
        return _getFundAmounts(amounts);
    }

    function testGetWithdrawAmounts(int256[] memory amounts)
        public
        pure
        returns (uint256[] memory)
    {
        return _getWithdrawAmounts(amounts);
    }
}
