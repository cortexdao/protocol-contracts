// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.11;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/utils/Address.sol";
import "./APYMetaPoolToken.sol";

contract APYPoolTokenV2 is APYPoolToken {
    using SafeMath for uint256;

    /* ------------------------------- */
    /* impl-specific storage variables */
    /* ------------------------------- */
    APYMetaPoolToken public mApt;
    uint256 public feePeriod;
    uint256 public feePercentage;

    /* ------------------------------- */

    function initializeUpgrade(address payable _mApt)
        external
        virtual
        onlyAdmin
    {
        mApt = APYMetaPoolToken(_mApt);
        feePeriod = 1 days;
        feePercentage = 5;
    }

    function setMetaPoolToken(address payable _mApt) public onlyOwner {
        require(Address.isContract(_mApt), "INVALID_ADDRESS");
        mApt = APYMetaPoolToken(_mApt);
    }

    function setFeePeriod(uint256 _feePeriod) public onlyOwner {
        feePeriod = _feePeriod;
    }

    function setFeePercentage(uint256 _feePercentage) public onlyOwner {
        feePercentage = _feePercentage;
    }

    function getPoolTotalEthValue()
        public
        view
        virtual
        override
        returns (uint256)
    {
        uint256 underlyerValue = getPoolUnderlyerEthValue();
        uint256 mAptValue = getDeployedEthValue();
        return underlyerValue.add(mAptValue);
    }

    function getPoolUnderlyerEthValue() public view virtual returns (uint256) {
        return getEthValueFromTokenAmount(underlyer.balanceOf(address(this)));
    }

    function getDeployedEthValue() public view virtual returns (uint256) {
        return mApt.getDeployedEthValue(address(this));
    }

    /**
     * @notice Redeems APT amount for its underlying token amount.
     * @param aptAmount The amount of APT tokens to redeem
     */
    function redeem(uint256 aptAmount)
        external
        virtual
        override
        nonReentrant
        whenNotPaused
    {
        require(!redeemLock, "LOCKED");
        require(aptAmount > 0, "AMOUNT_INSUFFICIENT");
        require(aptAmount <= balanceOf(msg.sender), "BALANCE_INSUFFICIENT");

        uint256 redeemTokenAmt = getUnderlyerAmount(aptAmount);
        require(
            redeemTokenAmt <= underlyer.balanceOf(address(this)),
            "RESERVE_INSUFFICIENT"
        );

        _burn(msg.sender, aptAmount);
        underlyer.safeTransfer(msg.sender, redeemTokenAmt);

        emit RedeemedAPT(
            msg.sender,
            underlyer,
            redeemTokenAmt,
            aptAmount,
            getEthValueFromTokenAmount(redeemTokenAmt),
            getPoolTotalEthValue()
        );
    }

    function infiniteApprove(address delegate)
        external
        nonReentrant
        whenNotPaused
        onlyOwner
    {
        underlyer.safeApprove(delegate, type(uint256).max);
    }

    function revokeApprove(address delegate) external nonReentrant onlyOwner {
        underlyer.safeApprove(delegate, 0);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);
        // allow minting and burning
        if (from == address(0) || to == address(0)) return;
        // block transfer between users
        revert("INVALID_TRANSFER");
    }
}
