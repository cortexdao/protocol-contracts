// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;
pragma experimental ABIEncoderV2;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {IStrategy, Asset} from "./IStrategy.sol";

abstract contract APYStrategy is IStrategy, Ownable {
    using SafeMath for uint256;

    string public override name;

    Asset[] internal _inputAssets;

    constructor(string memory _name) internal {
        name = _name;
    }

    function inputAssets() external override view returns (Asset[] memory) {
        return _inputAssets;
    }

    /**
     * @dev This function should be used in the constructor
     *      of derived contracts to set `inputAssets`.
     */
    function _setInputAssets(
        address[] memory tokens,
        uint256[] memory proportions
    ) internal {
        require(
            tokens.length == proportions.length,
            "Strategy/invalid-data-length"
        );
        // TODO: validate addresses are different

        uint256 totalProportion;
        for (uint256 i = 0; i < tokens.length; i++) {
            IERC20 token = IERC20(tokens[i]);
            uint256 proportion = proportions[i];

            require(0 < proportion, "Strategy/invalid-proportion");
            require(proportion <= 100, "Strategy/invalid-proportion");
            totalProportion = totalProportion.add(proportion);

            _inputAssets.push(Asset(token, proportion));
        }
        require(totalProportion == 100, "Strategy/invalid-proportion");
    }
}

/** @dev For use in testing only !
 *       Needed because we can't deploy an abstract contract.
 */
contract TestStrategy is APYStrategy {
    /*
     * @dev Normally a derived strategy would not need constructor args.
     *      This is purely for allowing different contracts for testing.
     */
    constructor(address[] memory tokens, uint256[] memory proportions)
        public
        APYStrategy("TestStrategy")
    {
        _setInputAssets(tokens, proportions);
    }
}
