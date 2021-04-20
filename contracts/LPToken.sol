// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccountManager} from "./AccountManager.sol";
import {PoolTokenV2} from "./PoolTokenV2.sol";

contract LPToken is ERC721 {
    struct UndeployedCapital {
        uint256 lastDeploymentId;
        uint256 amount;
        address tokenAddress;
    }

    AccountManager private _accountManager;

    /// @notice Token ID to shares
    mapping(uint256 => uint256) private _shares;

    /// @notice Token ID to deposits
    mapping(uint256 => UndeployedCapital) public undeployedCapital;

    uint256 public totalShares;

    constructor(AccountManager accountManager) public {
        _accountManager = accountManager;
    }

    function deposit(
        uint256 tokenId,
        uint256 amount,
        address poolAddress
    ) external {
        require(msg.sender == ownerOf(tokenId), "NOT_OWNER_OF_TOKEN_ID");

        _issueShares(tokenId);

        if (undeployedCapital[tokenId].lastDeploymentId == 0) {
            undeployedCapital[tokenId] = UndeployedCapital(
                _accountManager.lastDeploymentId,
                0,
                address(PoolTokenV2(poolAddress).underlyer)
            );
        }
        undeployedCapital[tokenId].amount += amount;

        PoolTokenV2(poolAddress).underlyer.transferFrom(
            msg.sender,
            poolAddress,
            amount
        );
    }

    function shares(uint256 tokenId) external {
        return _shares[tokenId].add(_pendingShares(tokenId));
    }

    function _issueShares(uint256 tokenId) internal {
        uint256 newShares = _pendingShares(tokenId);
        // order in which users deposit next *might* effect their share amount
        totalShares += newShares;
        _shares[tokenId] += newShares;
    }

    function _pendingShares(uint256 tokenId) internal returns (uint256) {
        if (!_hasUndeployedCapital(tokenId)) {
            return 0;
        }

        uint256 currentDeploymentId =
            undeployedCapital[tokenId].lastDeploymentId + 1;
        Deployment currentDeployment =
            _accountManager.deployments(currentDeploymentId);
        uint256 tvl = currentDeployment.tvl;
        uint256 prices = currentDeployment.prices;
        uint256 decimals =
            IERC20(undeployedCapital[tokenId].tokenAddress).decimals();

        return
            undeployedCapital[tokenId]
                .amount
                .mul(prices[undeployedCapital[tokenId].tokenAddress])
                .mul(10**(18 - decimals))
                .mul(totalShares ? totalShares : 1)
                .div(tvl);
    }

    function _hasUndeployedCapital(tokenId) internal returns (bool) {
        return
            undeployedCapital[tokenId].lastDeploymentId + 1 <=
            _accountManager.lastDeploymentId;
    }
}
