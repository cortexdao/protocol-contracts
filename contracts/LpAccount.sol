pragma solidity 0.6.11;

interface IZap {
    // TODO: How to associate asset allocations...

    // array of underlyer amounts
    function deployLiquidity(uint256[] calldata amounts) external;

    // LP token amount
    function unwindLiquidity(uint256 amount) external;

    function name() external view returns (string memory);
}

interface LpAccount {
    // delegatecall to IZap.deployLiquidity
    function deployStrategy(string id, uint256[] calldata amounts) external;

    function unwindStrategy(string id, uint256 amount) external;
}

interface IZapRegistry {
    // ID should be human readable
    function registerZap(string id, address zap) external;

    function removeZap(string id) external;

    function ids() external returns (string[] calldata);
}
