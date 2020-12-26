// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Pausable.sol";

contract CapitalDeployer is
    Initializable,
    OwnableUpgradeSafe,
    ReentrancyGuardUpgradeSafe,
    PausableUpgradeSafe
{
    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    string public id;
    address public executor;

    /* ------------------------------- */

    function initialize(string memory _id, address _executor)
        external
        initializer
    {
        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();
        __ReentrancyGuard_init_unchained();
        __Pausable_init_unchained();

        // initialize impl-specific storage
        id = _id;
        executor = _executor;
    }
}
