// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {PoolManager} from "../PoolManager.sol";
import {PoolTokenV2} from "../PoolTokenV2.sol";
import {MetaPoolToken} from "../MetaPoolToken.sol";
import {ILpSafeFunder} from "../interfaces/ILpSafeFunder.sol";

/**
 * @title Pool Manager
 * @author APY.Finance
 * @notice The pool manager logic contract for use with the pool manager proxy contract.
 *
 * The Pool Manager orchestrates the movement of capital within the APY system
 * between pools (PoolTokenV2 contracts) and strategy accounts, e.g. LP Safe.
 *
 * Transferring from a PoolToken to an account stages capital in preparation
 * for executing yield farming strategies.
 *
 * Capital is unwound from yield farming strategies for user withdrawals by transferring
 * from accounts to PoolTokens.
 *
 * When funding an account from a pool, the Pool Manager simultaneously register the asset
 * allocation with the TVL Manager to ensure the TVL is properly updated.
 */
contract TestPoolManager is PoolManager {
    constructor(address addressRegistry_)
        public
        PoolManager(addressRegistry_)
    {} // solhint-disable-line no-empty-blocks

    /**
     * @notice Register an asset allocation for the account with each pool underlyer
     * @param account address of the registered account
     * @param pools list of pools whose underlyers will be registered
     */
    function testRegisterPoolUnderlyers(
        address account,
        PoolTokenV2[] memory pools
    ) public {
        _registerPoolUnderlyers(account, pools);
    }

    function testRebalance(
        address account,
        PoolTokenV2[] memory pools,
        int256[] memory amounts
    ) public {
        _rebalance(account, pools, amounts);
    }

    function testTransferBetweenAccountAndPools(
        address account,
        PoolTokenV2[] memory pools,
        int256[] memory amounts
    ) public {
        _transferBetweenAccountAndPools(account, pools, amounts);
    }

    function testRebalanceMapt(
        MetaPoolToken mApt,
        PoolTokenV2[] memory pools,
        int256[] memory mAptDeltas
    ) public {
        _rebalanceMapt(mApt, pools, mAptDeltas);
    }

    function testGetRebalanceAmounts(bytes32[] memory poolIds)
        public
        view
        returns (PoolAmount[] memory)
    {
        return _getRebalanceAmounts(poolIds);
    }

    function testCalculateMaptDeltas(
        MetaPoolToken mApt,
        PoolTokenV2[] memory pools,
        int256[] memory amounts
    ) public view returns (int256[] memory) {
        return _calculateMaptDeltas(mApt, pools, amounts);
    }

    function testGetPoolsAndAmounts(
        ILpSafeFunder.PoolAmount[] memory poolAmounts
    ) public view returns (PoolTokenV2[] memory, int256[] memory) {
        return _getPoolsAndAmounts(poolAmounts);
    }
}
