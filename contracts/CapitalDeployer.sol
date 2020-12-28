// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./CloneFactory.sol";
import "./CapitalAccount.sol";

contract CapitalDeployer is Ownable, CloneFactory {
    using SafeERC20 for IERC20;

    address public libraryAddress;

    bytes32[] internal _accountIds;
    address[] internal _tokenAddresses;

    mapping(bytes32 => address) public idToAccount;

    mapping(bytes32 => address[]) public idToTokens;
    mapping(address => bytes32[]) public tokenToIds;

    event AccountCreated(bytes32 id, address account);
    event AccountDeleted(bytes32 id);

    constructor(address _libraryAddress) public {
        libraryAddress = _libraryAddress;
    }

    /// @dev Allow contract to receive Ether.
    receive() external payable {} // solhint-disable-line no-empty-blocks

    function setLibraryAddress(address _libraryAddress) public onlyOwner {
        libraryAddress = _libraryAddress;
    }

    function createAccount(bytes32 id) public onlyOwner {
        address account = createClone(libraryAddress);
        ICapitalAccount(account).initialize(id);
        _accountIds.push(id);
        idToAccount[id] = account;
        emit AccountCreated(id, account);
    }

    function sendFunds(
        bytes32 id,
        IERC20[] memory tokens,
        uint256[] memory balances
    ) public onlyOwner {
        address account = idToAccount[id];
        for (uint256 i = 0; i < tokens.length; i++) {
            require(
                tokens[i].balanceOf(address(this)) >= balances[i],
                "Insufficient balance"
            );
            tokens[i].safeTransfer(account, balances[i]);
        }
    }

    function registerTokens(bytes32 id, address[] memory tokens)
        public
        onlyOwner
    {
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            if (tokenToIds[token].length == 0) {
                _tokenAddresses.push(token);
            }
            tokenToIds[token].push(id);
        }
        idToTokens[id] = tokens;
    }

    function copyTokenRegistration(bytes32 newId, bytes32 oldId)
        public
        onlyOwner
    {
        require(idToTokens[oldId].length != 0, "Invalid: ID missing");
        require(
            idToTokens[newId].length != 0,
            "Invalid: Existing registration"
        );
        address[] storage tokens = idToTokens[oldId];
        idToTokens[newId] = tokens;
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            tokenToIds[token].push(newId);
        }
    }

    function unregisterAndWithdrawTokens(bytes32 id) public onlyOwner {
        require(id != 0, "Invalid: zero ID");
        address[] storage tokens = idToTokens[id];
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            bytes32[] storage ids = tokenToIds[token];

            uint256 j;
            for (j = 0; j < ids.length; j++) {
                if (ids[j] == id) break;
            }
            // not found
            if (j == ids.length) break;

            if (j != ids.length - 1) {
                ids[j] = ids[ids.length - 1];
            }
            ids.pop();
        }
        ICapitalAccount(idToAccount[id]).withdraw(
            payable(address(this)),
            tokens
        );
        delete idToTokens[id];
    }

    function deleteAccount(bytes32 id) external onlyOwner {
        uint256 i;
        for (i = 0; i < _accountIds.length; i++) {
            if (_accountIds[i] == id) break;
        }
        // not found
        if (i == _accountIds.length) return;

        if (i != _accountIds.length - 1) {
            _accountIds[i] = _accountIds[_accountIds.length - 1];
        }
        _accountIds.pop();

        unregisterAndWithdrawTokens(id);
        ICapitalAccount(idToAccount[id]).selfDestruct(payable(address(this)));
        delete idToAccount[id];

        emit AccountDeleted(id);
    }

    function accountIds() public view returns (bytes32[] memory) {
        return _accountIds;
    }
}
