// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

interface ICurvePool {
    // solhint-disable-next-line func-name-mixedcase
    function CRV_ADDRESS() external view returns (address);

    // solhint-disable-next-line func-name-mixedcase
    function SWAP_ADDRESS() external view returns (address);

    // solhint-disable-next-line func-name-mixedcase
    function LP_ADDRESS() external view returns (address);

    // solhint-disable-next-line func-name-mixedcase
    function GAUGE_ADDRESS() external view returns (address);

    // solhint-disable-next-line func-name-mixedcase
    function DENOMINATOR() external view returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function SLIPPAGE() external view returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function N_COINS() external view returns (uint256);
}
