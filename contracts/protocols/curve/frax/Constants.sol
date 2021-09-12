// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {INameIdentifier} from "contracts/common/Imports.sol";
import {
    Curve3PoolUnderlyerConstants
} from "contracts/protocols/curve/3pool/Constants.sol";

abstract contract CurveFraxConstants is
    Curve3PoolUnderlyerConstants,
    INameIdentifier
{
    string public constant override NAME = "curve-frax";

    address public constant META_POOL_ADDRESS =
        0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B;
    // sometimes a metapool is its own LP token; otherwise,
    // you can obtain from `token` attribute
    address public constant LP_TOKEN_ADDRESS =
        0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B;
    address public constant LIQUIDITY_GAUGE_ADDRESS =
        0x72E158d38dbd50A483501c24f792bDAAA3e7D55C;

    // metapool primary underlyer
    address public constant PRIMARY_UNDERLYER_ADDRESS =
        0x853d955aCEf822Db058eb8505911ED77F175b99e;
}
