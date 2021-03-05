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
    uint256 internal _tvl;

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
