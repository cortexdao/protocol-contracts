// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolManager, Deployment} from "./PoolManager.sol";
import {PoolTokenV2} from "./PoolTokenV2.sol";

contract LPToken is ERC721 {
    using SafeMath for uint256;

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

    /// @notice total number of shares at time of deployment
    mapping(uint256 => uint256) public deploymentToTotalShares;

    /// @notice deployment ID to total deposited for deployment
    mapping(uint256 => uint256) public deploymentToTotalDeposited;

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
        _updateUndeployedCapital(tokenId, amount);

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
        _shares[tokenId] += newShares;
    }

    /// @dev Return the number of shares not yet issued for a past deployment
    function _pendingShares(uint256 tokenId) internal returns (uint256) {
        if (!_hasEarmarkedCapital(tokenId)) {
            return 0;
        }

        uint256 closingDeploymentId =
            undeployedCapital[tokenId].closingDeploymentId;
        Deployment closingDeployment =
            _poolManager.deployments(closingDeploymentId);
        uint256 tvl = closingDeployment.tvl;
        uint256 prices = closingDeployment.prices;
        uint256 decimals =
            IERC20(undeployedCapital[tokenId].tokenAddress).decimals();

        uint256 totalShares = deploymentToTotalShares[closingDeploymentId];
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

    function _updateUndeployedCapital(uint256 tokenId, uint256 amount)
        internal
    {
        // add deposit to current period's undeployed amount
        undeployedCapital[tokenId].amount = undeployedCapital[tokenId]
            .amount
            .add(amount);
        uint256 closingDeploymentId =
            undeployedCapital[tokenId].closingDeploymentId;
        deploymentToTotalDeposited[
            closingDeploymentId
        ] = deploymentToTotalDeposited[closingDeploymentId].add(amount);
    }

    /**
     * @notice Return total number of shares issued for deployment
     * @dev Calculation is structured to use previous deployment TVL and total shares
     *      so that this can be used to track current pre-deployment issued shares.
     */
    function _totalIssuedShares(uint256 deploymentId)
        internal
        returns (uint256)
    {
        uint256 prevDeploymentId = deploymentId - 1;
        uint256 tvl = _poolManager.deployments(prevDeploymentId);
        uint256 totalShares = deploymentToTotalShares[prevDeploymentId];
        uint256 totalDeposited = deploymentToTotalDeposited[deploymentId];
        return totalDeposited.mul(totalShares).div(tvl);
    }
}
