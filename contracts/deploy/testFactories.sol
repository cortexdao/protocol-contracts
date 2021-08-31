// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {TestMetaPoolToken} from "contracts/mapt/TestMetaPoolToken.sol";
import {MetaPoolToken} from "contracts/mapt/MetaPoolToken.sol";

import {MetaPoolTokenFactory} from "./factories.sol";

contract TestMetaPoolTokenFactory is MetaPoolTokenFactory {
    function _deployLogic() internal override returns (address) {
        TestMetaPoolToken logic = new TestMetaPoolToken();
        return address(logic);
    }
}
