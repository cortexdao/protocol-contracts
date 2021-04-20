// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccountManager} from "./AccountManager.sol";
import {PoolTokenV2} from "./PoolTokenV2.sol";

contract LPToken is ERC721 {
    struct Deposit {
        uint256 lastDeploymentId;
        uint256 amount;
        address tokenAddress;
    }

    AccountManager private _accountManager;

    /// @notice Token ID to shares
    mapping(uint256 => uint256) private _shares;

    /// @notice Token ID to deposits
    mapping(uint256 => Deposit) public lastDeposit;

    uint256 public totalShares;

    constructor(AccountManager accountManager) public {
        _accountManager = accountManager;
    }

    modifier updateShares(uint256 tokenId) {
        if (
            lastDeposit.lastDeploymentId + 1 <= _accountManager.lastDeploymentId
        ) {
            uint256 newShares = _lastDepositShareAmount();
            lastDeposit[tokenId] = Deposit(0, 0, address(0));

            // order in which users deposit next *might* effect their share amount
            totalShares += newShares;
            _shares[tokenId] += newShares;
        }
        _;
    }

    function deposit(
        uint256 tokenId,
        uint256 amount,
        address poolAddress
    ) external updateShares(tokenId) {
        require(msg.sender == ownerOf(tokenId), "NOT_OWNER_OF_TOKEN_ID");

        if (lastDeposit[tokenId].lastDeploymentId == 0) {
            lastDeposit[tokenId] = Deposit(
                _accountManager.lastDeploymentId,
                amount,
                address(PoolTokenV2(poolAddress).underlyer)
            );

            // Increase the deposit amount if a new deposit is made before a deployment
        } else {
            lastDeposit[tokenId].amount += amount;
        }

        PoolTokenV2(poolAddress).underlyer.transfer(
            amount,
            msg.sender,
            poolAddress
        );
    }

    function shares(uint256 tokenId) external {
        return _shares[tokenId].add(_lastDepositShareAmount(tokenId));
    }

    function _lastDepositShareAmount(uint256 tokenId)
        private
        returns (uint256)
    {
        bool hasBeenDeployed =
            lastDeposit[tokenId].lastDeploymentId + 1 <=
                _accountManager.lastDeploymentId;
        if (!hasBeenDeployed) {
            return 0;
        }

        uint256 tvl =
            _accountManager
                .deployments(lastDeposit[tokenId].lastDeploymentId + 1)
                .tvl;
        uint256 prices =
            _accountManager
                .deployments(lastDeposit[tokenId].lastDeploymentId + 1)
                .prices;
        uint256 decimals = IERC20(lastDeposit[tokenId].tokenAddress).decimals();

        return
            lastDeposit[tokenId]
                .amount
                .mul(prices[lastDeposit[tokenId].tokenAddress])
                .mul(10**(18 - decimals))
                .mul(totalShares ? totalShares : 1)
                .div(tvl);
    }
}
