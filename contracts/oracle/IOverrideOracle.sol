// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

import {IOracleAdapter} from "./IOracleAdapter.sol";

interface IOverrideOracle is IOracleAdapter {
    event AssetValueSet(
        address asset,
        uint256 value,
        uint256 period,
        uint256 periodEnd
    );
    event AssetValueUnset(address asset);
    event TvlSet(uint256 value, uint256 period, uint256 periodEnd);
    event TvlUnset();

    function emergencySetAssetValue(
        address asset,
        uint256 value,
        uint256 period
    ) external;

    function emergencyUnsetAssetValue(address asset) external;

    function emergencySetTvl(uint256 value, uint256 period) external;

    function emergencyUnsetTvl() external;

    function hasTvlOverride() external view returns (bool);

    function hasAssetOverride(address asset) external view returns (bool);
}
