// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/Initializable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "./utils/EnumerableSet.sol";
import "./interfaces/IDetailedERC20.sol";
import "./interfaces/IAssetAllocation.sol";
import "./interfaces/ISequenceRegistry.sol";
import "./interfaces/IStrategyFactory.sol";
import "./APYGenericExecutor.sol";

contract SequenceRegistry is
    Initializable,
    OwnableUpgradeSafe,
    ISequenceRegistry,
    IAssetAllocation
{
    using SafeMath for uint256;
    using SafeERC20 for IDetailedERC20;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    address public proxyAdmin;
    IStrategyFactory public manager;
    APYGenericExecutor public executor;

    // Needs to be able to delete sequenceIds and sequences
    EnumerableSet.Bytes32Set private _sequenceIds;
    mapping(bytes32 => APYGenericExecutor.Data[]) private _sequenceData;
    mapping(bytes32 => string) private _sequenceSymbols;

    event AdminChanged(address);
    event ManagerChanged(address);
    event ExecutorChanged(address);

    function initialize(
        address adminAddress,
        address managerAddress,
        address executorAddress
    ) external initializer {
        require(adminAddress != address(0), "INVALID_ADMIN");
        require(managerAddress != address(0), "INVALID_MANAGER");
        require(executorAddress != address(0), "INVALID_EXECUTOR");

        // initialize ancestor storage
        __Context_init_unchained();
        __Ownable_init_unchained();

        // initialize impl-specific storage
        setAdminAddress(adminAddress);
        setManagerAddress(managerAddress);
        setExecutorAddress(executorAddress);
    }

    // solhint-disable-next-line no-empty-blocks
    function initializeUpgrade() external virtual onlyAdmin {}

    function setAdminAddress(address adminAddress) public onlyOwner {
        require(adminAddress != address(0), "INVALID_ADMIN");
        proxyAdmin = adminAddress;
        emit AdminChanged(adminAddress);
    }

    function setManagerAddress(address managerAddress) public onlyOwner {
        require(managerAddress != address(0), "INVALID_MANAGER");
        manager = IStrategyFactory(managerAddress);
        emit ManagerChanged(managerAddress);
    }

    function setExecutorAddress(address executorAddress) public onlyOwner {
        require(executorAddress != address(0), "INVALID_EXECUTOR");
        executor = APYGenericExecutor(executorAddress);
        emit ExecutorChanged(executorAddress);
    }

    modifier onlyAdmin() {
        require(msg.sender == proxyAdmin, "ADMIN_ONLY");
        _;
    }

    function addSequence(
        bytes32 sequenceId,
        APYGenericExecutor.Data[] calldata data,
        string calldata symbol
    ) external override onlyOwner {
        _sequenceIds.add(sequenceId);
        _sequenceData[sequenceId] = data;
        _sequenceSymbols[sequenceId] = symbol;
    }

    function removeSequence(bytes32 sequenceId) external override onlyOwner {
        delete _sequenceData[sequenceId];
        delete _sequenceSymbols[sequenceId];
        _sequenceIds.remove(sequenceId);
    }

    function isSequenceRegistered(bytes32 sequenceId)
        public
        view
        override
        returns (bool)
    {
        return _sequenceIds.contains(sequenceId);
    }

    /**
     * @notice Returns the list of sequenceIds.
     */
    function getSequenceIds()
        external
        view
        override
        returns (bytes32[] memory)
    {
        uint256 length = _sequenceIds.length();
        bytes32[] memory sequenceIds = new bytes32[](length);
        for (uint256 i = 0; i < length; i++) {
            sequenceIds[i] = _sequenceIds.at(i);
        }
        return sequenceIds;
    }

    /** @notice Returns the total balance in the system for given token.
     *  @dev The balance is possibly aggregated from multiple contracts
     *       holding the token.
     */
    function balanceOf(bytes32 sequenceId)
        external
        view
        override
        returns (uint256)
    {
        // Should check if the sequence ID exists first
        bytes memory returnData =
            executor.executeView(_sequenceData[sequenceId]);

        uint256 _balance;
        assembly {
            _balance := mload(add(returnData, 0x20))
        }

        return _balance;
    }

    /// @notice Returns the symbol of the given token.
    function symbolOf(bytes32 sequenceId)
        external
        view
        override
        returns (string memory)
    {
        return _sequenceSymbols[sequenceId];
    }
}
