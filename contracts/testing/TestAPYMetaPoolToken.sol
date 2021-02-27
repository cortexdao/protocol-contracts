// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "../APYPoolToken.sol";
import "../APYMetaPoolToken.sol";
import "../interfaces/IDetailedERC20.sol";

/**
 * @dev Test contract, DO NOT USE in production!
 */
contract TestAPYMetaPoolToken is APYMetaPoolToken {
    APYPoolToken public apt;
    uint256 internal _tvl;

    /** @dev Used for manipulating supply for testing.
     *  Regular `mint` is only usable by account set as manager.
     */
    function testMint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    /** @dev Used for manipulating supply for testing.
     *  Regular `burn` is only usable by account set as manager.
     */
    function testBurn(address account, uint256 amount) public {
        _burn(account, amount);
    }

    /** @dev Used for mocking in tests.  See `getTVL`. */
    function setTVL(uint256 tvl) public {
        _tvl = tvl;
    }

    /**
     * @dev Used for mocking in tests.  See `setTVL`.
     * Mainly intended for unit tests of the mAPT token, but this
     * is also handy for testing the APYManager interaction with
     * pools and strategies.
     */
    function getTVL() public view override returns (uint256) {
        return _tvl;
    }
}
