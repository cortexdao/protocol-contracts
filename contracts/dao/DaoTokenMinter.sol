// SPDX-License-Identifier: BUSDL-1.1
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import {IDetailedERC20} from "contracts/common/Imports.sol";
import {SafeERC20} from "contracts/libraries/Imports.sol";

import {ILocker} from "contracts/rewards/ILocker.sol";
import {DaoToken} from "./DaoToken.sol";

contract DaoTokenMinter {
    address public constant DAO_TOKEN_ADDRESS = "0x0";
    address public constant APY_TOKEN_ADDRESS =
        "0x95a4492F028aa1fd432Ea71146b433E7B4446611";

    function mint() external {
        ILocker apyToken = ILocker(APY_TOKEN_ADDRESS);
        require(block.timestamp < apyToken.lockEnd(), "MINT_PERIOD_EXPIRED");
        uint256 apyUnlockedBalance = apyToken.unlockedAmount();
        apyToken.lockAmount(apyUnlockedBalance);
        DaoToken(DAO_TOKEN_ADDRESS).mint(apyUnlockedBalance);
    }
}
