pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

// solhint-disable func-name-mixedcase

abstract contract CurveBaseGauge {
    function GAUGE_ADDRESS() external pure virtual returns (address);

    function _depositToGauge() internal virtual;

    function _withdrawFromGauge(uint256 amount)
        internal
        virtual
        returns (uint256);
}
