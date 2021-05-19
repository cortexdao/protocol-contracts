// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol";

contract OracleAdapterProxy is TransparentUpgradeableProxy {
    constructor(
        address _logic,
        address _proxyAdmin,
        address[] memory _assets,
        address[] memory _sources,
        address _tvlSource,
        address _fallbackOracle
    )
        public
        TransparentUpgradeableProxy(
            _logic,
            _proxyAdmin,
            abi.encodeWithSignature(
                "initialize(address,address[],address[],address,address)",
                _proxyAdmin,
                _assets,
                _sources,
                _tvlSource,
                _fallbackOracle
            )
        )
    {} // solhint-disable no-empty-blocks
}
