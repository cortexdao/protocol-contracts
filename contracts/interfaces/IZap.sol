pragma solidity 0.6.11;

interface IZap {
    // TODO: How to associate asset allocations...

    // array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external;

    // LP token amount
    function unwindLiquidity(uint256 amount) external;

    function NAME() external view returns (string memory);
}
