// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;

/**
 * @dev Used in testing to send ETH to contract addresses
 * that reject ETH transfers.
 */
contract EthSender {
    function send(address payable recipient) external {
        selfdestruct(recipient);
    }

    // solhint-disable-next-line no-empty-blocks
    receive() external payable {}
}
