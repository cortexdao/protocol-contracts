// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {ImmutableAssetAllocation} from "./Imports.sol";

contract TestImmutableAssetAllocation is ImmutableAssetAllocation {
    string public constant override NAME = "testAllocation";

    function testGetTokenData() external pure returns (TokenData[] memory) {
        return _getTokenData();
    }

    // solhint-disable-next-line no-unused-vars
    function balanceOf(address account, uint8 tokenIndex)
        external
        view
        override
        returns (uint256)
    {
        return 42;
    }

    function _getTokenData()
        internal
        pure
        override
        returns (TokenData[] memory)
    {
        TokenData[] memory tokens_ = new TokenData[](2);
        tokens_[0] = TokenData(
            0xCAfEcAfeCAfECaFeCaFecaFecaFECafECafeCaFe,
            "CAFE",
            6
        );
        tokens_[1] = TokenData(
            0xBEeFbeefbEefbeEFbeEfbEEfBEeFbeEfBeEfBeef,
            "BEEF",
            8
        );
        return tokens_;
    }

    // solhint-disable-next-line no-unused-vars
    function _validateTokenAddress(address token) internal view override {
        return;
    }
}
