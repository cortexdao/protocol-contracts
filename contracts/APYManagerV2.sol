// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/IAddressRegistry.sol";
import "./interfaces/IDetailedERC20.sol";
import "./interfaces/IStrategyFactory.sol";
import "./interfaces/IAssetAllocationRegistry.sol";
import "./APYPoolTokenV2.sol";
import "./APYMetaPoolToken.sol";
import "./Strategy.sol";

contract APYManagerV2 is Initializable, OwnableUpgradeSafe, IStrategyFactory {
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    // V1
    address public proxyAdmin;
    IAddressRegistry public addressRegistry;
    APYMetaPoolToken public mApt;

    bytes32[] internal _poolIds;
    // Replacing this last V1 storage slot is ok:
    // address[] internal _tokenAddresses;
    // WARNING: we should clear storage via `deleteTokenAddresses`
    //          before the V2 upgrade

    // V2
    mapping(bytes32 => address) public getStrategy;
    mapping(address => bool) public override isStrategyDeployed;
    IAssetAllocationRegistry public assetAllocationRegistry;

    /* ------------------------------- */

    event AdminChanged(address);
    event StrategyDeployed(address strategy, address generalExecutor);

    function initialize(address adminAddress) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function deployStrategy(address generalExecutor)
        external
        override
        onlyOwner
        returns (address)
    {
        Strategy strategy = new Strategy(generalExecutor);
        isStrategyDeployed[address(strategy)] = true;
        emit StrategyDeployed(address(strategy), generalExecutor);
        return address(strategy);
    }

    function setStrategyId(bytes32 id, address strategy) public onlyOwner {
        getStrategy[id] = strategy;
    }

    function fundStrategy(
        address strategy,
        IStrategyFactory.StrategyAllocation memory allocation,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) external override onlyOwner {
        _registerAllocationData(viewData);
        _fundStrategy(strategy, allocation);
    }

    function fundAndExecute(
        address strategy,
        IStrategyFactory.StrategyAllocation memory allocation,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) external override onlyOwner {
        _registerAllocationData(viewData);
        _fundStrategy(strategy, allocation);
        execute(strategy, steps, viewData);
    }

    function execute(
        address strategy,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) public override onlyOwner {
        require(isStrategyDeployed[strategy], "Invalid Strategy");
        _registerAllocationData(viewData);
        IStrategy(strategy).execute(steps);
    }

    function executeAndWithdraw(
        address strategy,
        IStrategyFactory.StrategyAllocation memory allocation,
        APYGenericExecutor.Data[] memory steps,
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) external override onlyOwner {
        execute(strategy, steps, viewData);
        _withdrawFromStrategy(strategy, allocation);
        _registerAllocationData(viewData);
    }

    function withdrawFromStrategy(
        address strategy,
        IStrategyFactory.StrategyAllocation memory allocation
    ) external override onlyOwner {
        _withdrawFromStrategy(strategy, allocation);
    }

    function _fundStrategy(
        address strategy,
        IStrategyFactory.StrategyAllocation memory allocation
    ) internal {
        require(
            allocation.poolIds.length == allocation.amounts.length,
            "allocation length mismatch"
        );
        require(isStrategyDeployed[strategy], "Invalid Strategy");
        uint256[] memory mintAmounts = new uint256[](allocation.poolIds.length);
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            uint256 poolAmount = allocation.amounts[i];
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            IDetailedERC20 underlyer = pool.underlyer();

            uint256 tokenEthPrice = pool.getTokenEthPrice();
            uint8 decimals = underlyer.decimals();
            uint256 mintAmount =
                mApt.calculateMintAmount(poolAmount, tokenEthPrice, decimals);
            mintAmounts[i] = mintAmount;

            underlyer.safeTransferFrom(address(pool), strategy, poolAmount);
        }
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            mApt.mint(address(pool), mintAmounts[i]);
        }
    }

    function _withdrawFromStrategy(
        address strategy,
        IStrategyFactory.StrategyAllocation memory allocation
    ) internal {
        require(
            allocation.poolIds.length == allocation.amounts.length,
            "allocation length mismatch"
        );
        require(isStrategyDeployed[strategy], "Invalid Strategy");

        uint256[] memory burnAmounts = new uint256[](allocation.poolIds.length);
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            IDetailedERC20 underlyer = pool.underlyer();
            uint256 amountToSend = allocation.amounts[i];

            uint256 tokenEthPrice = pool.getTokenEthPrice();
            uint8 decimals = underlyer.decimals();
            uint256 burnAmount =
                mApt.calculateMintAmount(amountToSend, tokenEthPrice, decimals);
            burnAmounts[i] = burnAmount;

            underlyer.safeTransferFrom(strategy, address(pool), amountToSend);
        }
        for (uint256 i = 0; i < allocation.poolIds.length; i++) {
            APYPoolTokenV2 pool =
                APYPoolTokenV2(
                    addressRegistry.getAddress(allocation.poolIds[i])
                );
            mApt.burn(address(pool), burnAmounts[i]);
        }
    }

    function _registerAllocationData(
        IAssetAllocationRegistry.AssetAllocation[] memory viewData
    ) internal {
        for (uint256 i = 0; i < viewData.length; i++) {
            IAssetAllocationRegistry.AssetAllocation memory viewAllocation =
                viewData[i];
            assetAllocationRegistry.addAssetAllocation(
                viewAllocation.sequenceId,
                viewAllocation.data,
                viewAllocation.symbol,
                viewAllocation.decimals
            );
        }
    }

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    /// @dev Allow contract to receive Ether.
    receive() external payable {} // solhint-disable-line no-empty-blocks

    function setMetaPoolToken(address payable _mApt) public onlyOwner {
        mApt = APYMetaPoolToken(_mApt);
    }

    function setAddressRegistry(address _addressRegistry) public onlyOwner {
        require(_addressRegistry != address(0), "Invalid address");
        addressRegistry = IAddressRegistry(_addressRegistry);
    }

    function setAssetAllocationRegistry(address _addressRegistry)
        public
        onlyOwner
    {
        require(_addressRegistry != address(0), "Invalid address");
        assetAllocationRegistry = IAssetAllocationRegistry(_addressRegistry);
    }

    function setPoolIds(bytes32[] memory poolIds) public onlyOwner {
        _poolIds = poolIds;
    }

    function getPoolIds() public view returns (bytes32[] memory) {
        return _poolIds;
    }

    /// @dev part of temporary implementation for Chainlink integration;
    ///      likely need this to clear out storage prior to real upgrade.
    function deletePoolIds() external onlyOwner {
        delete _poolIds;
    }
}
