// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccountManager, Deployment} from "./AccountManager.sol";
import {PoolTokenV2} from "./PoolTokenV2.sol";

contract LPToken is ERC721 {
    struct UndeployedCapital {
        uint256 closingDeploymentId;
        uint256 amount;
        address tokenAddress;
    }

    AccountManager private _accountManager;

    /// @notice Token ID to shares
    mapping(uint256 => uint256) private _shares;
    /// @notice Token ID to deposits
    mapping(uint256 => UndeployedCapital) public undeployedCapital;

    /// @notice total shares issued up to last deployment
    uint256 public totalShares;
    /// @notice total issued so far during current pre-deployment period
    uint256 public newlyIssuedShares;

    constructor(AccountManager accountManager) public {
        _accountManager = accountManager;
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
        if (!_hasEarmarkedCapital(tokenId)) {
            _issueShares(tokenId);
            _resetEarmarkedCapital(tokenId, poolAddress);
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

    function _issueShares(uint256 tokenId, address poolAddress) internal {
        uint256 newShares = _pendingShares(tokenId, poolAddress);
        newlyIssuedShares += newShares;
        _shares[tokenId] += newShares;
    }

    function _resetEarmarkedCapital(uint256 tokenId, address poolAddress)
        internal
    {
        // if we issued shares to close out the deployment period, we need
        // to set the undeployed capital to the next period.
        address underlyerAddress = address(PoolTokenV2(poolAddress).underlyer);
        uint256 closingDeploymentId = _accountManager.lastDeploymentId + 1;
        undeployedCapital[tokenId] = UndeployedCapital(
            closingDeploymentId,
            0,
            underlyerAddress
        );
    }

    function _pendingShares(uint256 tokenId) internal returns (uint256) {
        if (!_hasEarmarkedCapital(tokenId)) {
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
                .mul(totalShares)
                .div(tvl);
    }

    function _hasEarmarkedCapital(tokenId) internal returns (bool) {
        return
            undeployedCapital[tokenId].closingDeploymentId <=
            _accountManager.lastDeploymentId;
    }
}
