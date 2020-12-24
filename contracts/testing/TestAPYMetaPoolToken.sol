// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@chainlink/contracts/src/v0.6/interfaces/AggregatorV3Interface.sol";
import "../APYPoolToken.sol";
import "../APYMetaPoolToken.sol";
import "../interfaces/IDetailedERC20.sol";

/** @dev Test contract, DO NOT USE in production!
*
* Workaround for non-existent TVL aggregator:
*
* Current test scenarios use just one pool at a time, so we can
* derive the correct TVL value by using the underlyer and its
* price aggregator from the pool.

*  If in the future we need to test with multiple pools and still
*  have no TVL aggregator available, we will need to change this.
*/
contract TestAPYMetaPoolToken is APYMetaPoolToken {
    APYPoolToken public apt;
    uint256 internal _tvl;

    /** @dev Used for mocking in unit tests. */
    function setTVL(uint256 tvl) public {
        _tvl = tvl;
    }

    /** @dev set the APT token needed for testing with single pool */
    function setApt(address payable _apt) public {
        apt = APYPoolToken(_apt);
    }

    /** @dev The fake implementation gets the ETH value of the
     *       manager's underlyer balance.
     *
     *       Used for integration tests.
     */
    function getTVL() public view override returns (uint256) {
        if (address(apt) == address(0)) {
            return _tvl;
        }
        AggregatorV3Interface agg = apt.priceAgg();
        (, int256 price, , , ) = agg.latestRoundData();
        require(price > 0, "UNABLE_TO_RETRIEVE_TVL");
        IDetailedERC20 underlyer = apt.underlyer();
        return
            uint256(price).mul(underlyer.balanceOf(manager)).div(
                10**uint256(underlyer.decimals())
            );
    }
}
