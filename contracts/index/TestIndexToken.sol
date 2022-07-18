// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IndexToken} from "contracts/index/IndexToken.sol";

contract TestIndexToken is IndexToken {
    function testMint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function testBurn(address account, uint256 amount) public {
        _burn(account, amount);
    }

    function testSetLastDepositTime(address account, uint256 timestamp) public {
        lastDepositTime[account] = timestamp;
    }

    function testGetDeployedValue() public view returns (uint256) {
        return _getDeployedValue();
    }

    function testGetPoolUnderlyerValue() public view returns (uint256) {
        return _getPoolUnderlyerValue();
    }

    function testGetUnderlyerAmountAfterFees(uint256 amount, bool arbFee)
        public
        view
        returns (uint256)
    {
        return _getUnderlyerAmountAfterFees(amount, arbFee);
    }

    function testGetUnderlyerAmountBeforeFees(uint256 amount, bool arbFee)
        public
        view
        returns (uint256)
    {
        return _getUnderlyerAmountBeforeFees(amount, arbFee);
    }
}
