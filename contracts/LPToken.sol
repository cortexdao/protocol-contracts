// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolManager, Deployment} from "./PoolManager.sol";
import {PoolTokenV2} from "./PoolTokenV2.sol";

contract LPToken is ERC721 {
    struct UndeployedCapital {
        uint256 closingDeploymentId;
        uint256 amount;
        address tokenAddress;
    }

    PoolManager private _poolManager;

    /// @notice Token ID to shares
    mapping(uint256 => uint256) private _shares;
    /// @notice Token ID to deposits
    mapping(uint256 => UndeployedCapital) public undeployedCapital;

    /// @notice total shares issued up to last deployment
    uint256 public totalShares;
    /// @notice total issued so far during current pre-deployment period
    uint256 public newlyIssuedShares;

    constructor(PoolManager poolManager) public {
        _poolManager = poolManager;
        totalShares = 1;
    }

    function deposit(
        uint256 tokenId,
        uint256 amount,
        address poolAddress
    ) external {
        require(msg.sender == ownerOf(tokenId), "NOT_OWNER_OF_TOKEN_ID");

        // if there is any earmarked capital for a finished deployment,
        // issue shares and re-init period data
        if (_hasEarmarkedCapital(tokenId)) {
            _issueShares(tokenId);
            _resetUndeployedCapital(tokenId, poolAddress);
        }
        // add deposit to current period's undeployed amount
        undeployedCapital[tokenId].amount += amount;

        PoolTokenV2(poolAddress).underlyer.transferFrom(
            msg.sender,
            poolAddress,
            amount
        );
    }

    /**
     * @notice Return the number of shares for a given user and pool.
     * @param tokenId identifier for a user's pool contributions
     * @dev Result includes shares issued for deployed capital and pending shares
     *      for capital not yet deployed.
     */
    function shares(uint256 tokenId) external {
        return _shares[tokenId].add(_pendingShares(tokenId));
    }

    function _issueShares(uint256 tokenId) internal {
        uint256 newShares = _pendingShares(tokenId);
        newlyIssuedShares += newShares;
        _shares[tokenId] += newShares;
    }

    /// @dev Return the number of shares not yet issued for a past deployment
    function _pendingShares(uint256 tokenId) internal returns (uint256) {
        if (!_hasEarmarkedCapital(tokenId)) {
            return 0;
        }

        uint256 currentDeploymentId =
            undeployedCapital[tokenId].lastDeploymentId + 1;
        Deployment currentDeployment =
            _poolManager.deployments(currentDeploymentId);
        uint256 tvl = currentDeployment.tvl;
        uint256 prices = currentDeployment.prices;
        uint256 decimals =
            IERC20(undeployedCapital[tokenId].tokenAddress).decimals();

        return
            undeployedCapital[tokenId]
                .amount
                .mul(prices[undeployedCapital[tokenId].tokenAddress])
                .mul(10**(18 - decimals))
                .mul(totalShares)
                .div(tvl);
    }

    /// @dev Check if user capital has been accounted for in a past deployment
    function _hasEarmarkedCapital(tokenId) internal returns (bool) {
        return
            undeployedCapital[tokenId].closingDeploymentId <=
            _poolManager.lastDeploymentId;
    }

    /// @dev Reset the struct used for tracking capital in a deployment period
    function _resetUndeployedCapital(uint256 tokenId, address poolAddress)
        internal
    {
        // if we issued shares to close out the deployment period, we need
        // to set the undeployed capital to the next period.
        address underlyerAddress = address(PoolTokenV2(poolAddress).underlyer);
        uint256 closingDeploymentId = _poolManager.lastDeploymentId + 1;
        undeployedCapital[tokenId] = UndeployedCapital(
            closingDeploymentId,
            0,
            underlyerAddress
        );
    }
}
