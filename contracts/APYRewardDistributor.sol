// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract APYRewardDistributor is Ownable {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    event SignerSet(address newSigner);
    event Claimed(uint256 nonce, address recipient);

    IERC20 public immutable apyToken;
    mapping(address => uint256) public accountNonces;
    address public signer;

    constructor(IERC20 token, address signerAddress) public {
        require(token != address(0), "Invalid APY Address");
        require(signerAddress != address(0), "Invalid Signer Address");
        apyToken = apyContract;
        signer = signerAddress;
    }

    function setSigner(address newSigner) external onlyOwner {
        signer = newSigner;
    }

    function claim(
        uint256 nonce,
        address recipient,
        uint256 claimAmt,
        bytes calldata signature
    ) external {
        bytes32 h = keccak256(abi.encodePacked(nonce, recipient, claimAmt));
        address msgSigner = h.toEthSignedMessageHash().recover(signature);
        require(msgSigner == signer, "Invalid signature");
        require(accountNonces[recipient] == nonce, "Nonce Mismatch");
        require(token.balanceOf(this) >= claimAmt, "Insufficient Funds");

        accountNonces[recipient] += 1;
        token.safeTransfer(recipient, claimAmt);

        emit Claimed(nonce, recipient, claimAmt);
    }
}
