pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IZap} from "contracts/interfaces/IZap.sol";
import {IDetailedERC20} from "contracts/interfaces/IDetailedERC20.sol";
import {
    IStableSwap
} from "contracts/allocations/curve/interfaces/IStableSwap.sol";

contract Curve3PoolZap is IZap {
    string public constant override NAME = "Curve_3Pool";

    address public constant ALLOCATION_ADDRESS =
        0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE;

    address public constant STABLE_SWAP_ADDRESS =
        0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7;

    /// @param amounts array of underlyer amounts
    function deployLiquidity(
        string[] calldata symbols,
        uint256[] calldata amounts
    ) external {
        // TODO: validate symbols
        // TODO: unshuffle
    }

    /// @param amount LP token amount
    function unwindLiquidity(uint256 amount) external {}

    function getUnderlyerSymbols() external view returns (string[] memory) {
        // N_COINS is not available as a public function
        // so we have to hardcode the number here
        string[] memory symbols = new string[](3);
        for (uint256 i = 0; i < symbols.length; i++) {
            address underlyerAddress =
                IStableSwap(STABLE_SWAP_ADDRESS).coins(i);
            symbols[i] = IDetailedERC20(underlyerAddress).symbol();
        }
        return symbols;
    }

    function sortSymbolsArray(string[] memory symbols)
        returns (string[] memory)
    {
        //
    }
}
