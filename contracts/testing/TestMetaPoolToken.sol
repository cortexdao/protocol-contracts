// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "../PoolToken.sol";
import "../MetaPoolToken.sol";
import "../interfaces/IDetailedERC20.sol";

/**
 * @dev Test contract, DO NOT USE in production!
 */
contract TestMetaPoolToken is MetaPoolToken {
    uint256 internal _tvl;

    /** @dev Used for mocking in tests.  See `getTvl`. */
    function setTvl(uint256 tvl) public {
        _tvl = tvl;
    }

    /**
     * @dev Used for mocking in tests.  See `setTvl`.
     * Mainly intended for unit tests of the mAPT token, but this
     * is also handy for testing the PoolManager interaction with
     * pools and strategies.
     */
    function getTvl() public view override returns (uint256) {
        return _tvl;
    }
}
