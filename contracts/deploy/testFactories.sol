// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {TestMetaPoolToken} from "contracts/mapt/TestMetaPoolToken.sol";
import {MetaPoolToken} from "contracts/mapt/MetaPoolToken.sol";

import {MetaPoolTokenFactory, OracleAdapterFactory} from "./factories.sol";

contract TestMetaPoolTokenFactory is MetaPoolTokenFactory {
    function _deployLogic() internal override returns (address) {
        TestMetaPoolToken logic = new TestMetaPoolToken();
        return address(logic);
    }
}

contract TestOracleAdapterFactory is OracleAdapterFactory {
    address public oracleAdapter;

    function preCreate(
        address addressRegistry,
        address tvlSource,
        address[] memory assets,
        address[] memory sources,
        uint256 aggStalePeriod,
        uint256 defaultLockPeriod
    ) external returns (address) {
        oracleAdapter = super.create(
            addressRegistry,
            tvlSource,
            assets,
            sources,
            aggStalePeriod,
            defaultLockPeriod
        );
    }

    // solhint-disable no-unused-vars
    function create(
        address addressRegistry,
        address tvlSource,
        address[] memory assets,
        address[] memory sources,
        uint256 aggStalePeriod,
        uint256 defaultLockPeriod
    ) public override returns (address) {
        require(oracleAdapter != address(0), "USE_PRECREATE_FIRST");
        return oracleAdapter;
    }
    // solhint-enable
}
