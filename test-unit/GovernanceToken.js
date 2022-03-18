const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS, tokenAmountToBigNumber } = require("../utils/helpers");

describe("GovernanceToken", () => {
  // signers
  let deployer;
  let randomUser;
  let sender;
  let recipient;
  let locker;

  // deployed contracts
  let proxyAdmin;
  let logic;
  let logicV2;
  let proxy;
  let govToken;

  // contract factories
  let GovernanceTokenProxy;

  const totalSupply = tokenAmountToBigNumber("100000000");

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [deployer, sender, recipient, randomUser, locker] =
      await ethers.getSigners();

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    proxyAdmin = await ProxyAdmin.connect(deployer).deploy();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    logic = await GovernanceToken.connect(deployer).deploy();

    const GovernanceTokenV2 = await ethers.getContractFactory(
      "GovernanceTokenV2"
    );
    logicV2 = await GovernanceTokenV2.connect(deployer).deploy();

    GovernanceTokenProxy = await ethers.getContractFactory(
      "GovernanceTokenProxy"
    );
    proxy = await GovernanceTokenProxy.connect(deployer).deploy(
      logic.address,
      proxyAdmin.address,
      totalSupply
    );
    await proxyAdmin.connect(deployer).upgrade(proxy.address, logicV2.address);
    govToken = await GovernanceTokenV2.attach(proxy.address);
  });

  describe("Constructor", () => {
    it("Revert on invalid admin address", async () => {
      await expect(
        GovernanceTokenProxy.connect(deployer).deploy(
          logic.address,
          ZERO_ADDRESS,
          totalSupply
        )
      ).to.be.reverted;
    });
  });

  describe("initialize", () => {
    it("Owner set correctly", async () => {
      expect(await govToken.owner()).to.equal(deployer.address);
    });

    it("Name set correctly", async () => {
      expect(await govToken.name()).to.equal("APY Governance Token");
    });

    it("Symbol set correctly", async () => {
      expect(await govToken.symbol()).to.equal("APY");
    });

    it("Decimals set correctly", async () => {
      expect(await govToken.decimals()).to.equal(18);
    });

    it("Revert on sent ETH", async () => {
      await expect(
        deployer.sendTransaction({ to: govToken.address, value: "10" })
      ).to.be.revertedWith("DONT_SEND_ETHER");
    });

    it("totalSupply is set correctly", async () => {
      expect(await govToken.totalSupply()).to.equal(totalSupply);
    });

    it("Owner has total supply", async () => {
      expect(await govToken.balanceOf(deployer.address)).to.equal(
        await govToken.totalSupply()
      );
    });
  });

  describe("setAdminAdddress", () => {
    it("Owner can set", async () => {
      const contractAddress = (await deployMockContract(deployer, [])).address;
      await govToken.connect(deployer).setAdminAddress(contractAddress);
      expect(await govToken.proxyAdmin()).to.equal(contractAddress);
    });

    it("Revert on invalid admin address", async () => {
      await expect(
        govToken.connect(deployer).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });

    it("Unpermissioned cannot set", async () => {
      await expect(
        govToken.connect(randomUser).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("setLockEnd", () => {
    it("Owner can set", async () => {
      const timestamp = 1653349667;
      await govToken.connect(deployer).setLockEnd(timestamp);
      expect(await govToken.lockEnd()).to.equal(timestamp);
    });

    it("Unpermissioned cannot set", async () => {
      const timestamp = 1653349667;
      await expect(
        govToken.connect(randomUser).setLockEnd(timestamp)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("addLocker", () => {
    it("Owner can add locker", async () => {
      expect(await govToken.isLocker(locker.address)).to.be.false;
      await govToken.connect(deployer).addLocker(locker.address);
      expect(await govToken.isLocker(locker.address)).to.be.true;
    });

    it("Unpermissioned cannot add", async () => {
      await expect(
        govToken.connect(randomUser).addLocker(locker.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("removeLocker", () => {
    before("add locker", async () => {
      await govToken.connect(deployer).addLocker(locker.address);
      expect(await govToken.isLocker(locker.address)).to.be.true;
    });

    it("Owner can remove locker", async () => {
      await govToken.connect(deployer).removeLocker(locker.address);
      expect(await govToken.isLocker(locker.address)).to.be.false;
    });

    it("Unpermissioned cannot remove", async () => {
      await expect(
        govToken.connect(randomUser).removeLocker(locker.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("lockAmount / unlockedBalance", () => {
    let userBalance;

    before("set lock end", async () => {
      const timestamp = (await ethers.provider.getBlock()).timestamp;
      const lockEnd = timestamp + 86400 * 7;
      await govToken.connect(deployer).setLockEnd(lockEnd);
    });

    before("add locker", async () => {
      await govToken.connect(deployer).addLocker(locker.address);
      expect(await govToken.isLocker(locker.address)).to.be.true;
    });

    before("prepare user APY balance", async () => {
      userBalance = tokenAmountToBigNumber("1000");
      await govToken.connect(deployer).transfer(sender.address, userBalance);
      expect(await govToken.unlockedBalance(sender.address)).to.equal(
        userBalance
      );
    });

    it("Locker can lock amount", async () => {
      const amount = tokenAmountToBigNumber("100");
      await expect(govToken.connect(locker).lockAmount(sender.address, amount))
        .to.not.be.reverted;
      expect(await govToken.unlockedBalance(sender.address)).to.equal(
        userBalance.sub(amount)
      );
    });

    it("Unpermissioned cannot lock", async () => {
      const amount = tokenAmountToBigNumber("100");
      await expect(
        govToken.connect(randomUser).lockAmount(sender.address, amount)
      ).to.be.reverted;
    });

    it("Cannot lock more than balance", async () => {
      // case 1: lock more than balance at once
      await expect(
        govToken.connect(locker).lockAmount(sender.address, userBalance.add(1))
      ).to.be.revertedWith("AMOUNT_EXCEEDS_UNLOCKED_BALANCE");

      // case 2: lock in stages
      const amount = userBalance.div(2);
      // should be allowed to lock half
      await govToken.connect(locker).lockAmount(sender.address, amount);
      // cannot lock again with more than half
      expect(await govToken.unlockedBalance(sender.address)).to.equal(amount);
      await expect(
        govToken.connect(locker).lockAmount(sender.address, amount.add(1))
      ).to.be.revertedWith("AMOUNT_EXCEEDS_UNLOCKED_BALANCE");
      // can lock again with half
      await expect(govToken.connect(locker).lockAmount(sender.address, amount))
        .to.not.be.reverted;
      // everything is locked
      expect(await govToken.unlockedBalance(sender.address)).to.equal(0);
    });

    describe("transfer / transferFrom", () => {
      const lockedAmount = tokenAmountToBigNumber("100");
      let unlockedBalance;

      before("Lock amount for user", async () => {
        await govToken.connect(locker).lockAmount(sender.address, lockedAmount);
        unlockedBalance = await govToken.unlockedBalance(sender.address);
      });

      before("Approve another user to transfer", async () => {
        await govToken.connect(sender).approve(randomUser.address, userBalance);
      });

      it("Cannot `transfer` more than unlocked amount", async () => {
        await expect(
          govToken
            .connect(sender)
            .transfer(recipient.address, unlockedBalance.add(1))
        ).to.be.revertedWith("LOCKED_BALANCE");
      });

      it("Can `transfer` up to unlocked amount", async () => {
        const senderBalance = await govToken.balanceOf(sender.address);
        const recipientBalance = await govToken.balanceOf(recipient.address);
        const transferAmount = unlockedBalance;

        await govToken
          .connect(sender)
          .transfer(recipient.address, transferAmount);

        expect(await govToken.balanceOf(sender.address)).to.equal(
          senderBalance.sub(transferAmount)
        );
        expect(await govToken.balanceOf(recipient.address)).to.equal(
          recipientBalance.add(transferAmount)
        );
      });

      it("Can `transfer` locked amount after lock end", async () => {
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        const lockEnd = await govToken.lockEnd();
        expect(currentTimestamp).to.be.lt(lockEnd);
        const lockRemaining = lockEnd - currentTimestamp;
        await ethers.provider.send("evm_increaseTime", [lockRemaining]);
        await ethers.provider.send("evm_mine");

        const senderBalance = await govToken.balanceOf(sender.address);
        const recipientBalance = await govToken.balanceOf(recipient.address);
        const transferAmount = unlockedBalance.add(1);

        await govToken
          .connect(sender)
          .transfer(recipient.address, transferAmount);

        expect(await govToken.balanceOf(sender.address)).to.equal(
          senderBalance.sub(transferAmount)
        );
        expect(await govToken.balanceOf(recipient.address)).to.equal(
          recipientBalance.add(transferAmount)
        );
      });

      it("Cannot `transferFrom` more than unlocked amount", async () => {
        await expect(
          govToken
            .connect(recipient)
            .transferFrom(
              sender.address,
              randomUser.address,
              unlockedBalance.add(1)
            )
        ).to.be.revertedWith("LOCKED_BALANCE");
      });

      it("Can `transferFrom` up to unlocked amount", async () => {
        const senderBalance = await govToken.balanceOf(sender.address);
        const recipientBalance = await govToken.balanceOf(recipient.address);
        const transferAmount = unlockedBalance;

        await govToken
          .connect(randomUser)
          .transferFrom(sender.address, recipient.address, transferAmount);

        expect(await govToken.balanceOf(sender.address)).to.equal(
          senderBalance.sub(transferAmount)
        );
        expect(await govToken.balanceOf(recipient.address)).to.equal(
          recipientBalance.add(transferAmount)
        );
      });

      it("Can `transferFrom` locked amount after lock end", async () => {
        const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
        const lockEnd = await govToken.lockEnd();
        expect(currentTimestamp).to.be.lt(lockEnd);
        const lockRemaining = lockEnd - currentTimestamp;
        await ethers.provider.send("evm_increaseTime", [lockRemaining]);
        await ethers.provider.send("evm_mine");

        const senderBalance = await govToken.balanceOf(sender.address);
        const recipientBalance = await govToken.balanceOf(recipient.address);
        const transferAmount = unlockedBalance.add(1);

        await govToken
          .connect(randomUser)
          .transferFrom(sender.address, recipient.address, transferAmount);

        expect(await govToken.balanceOf(sender.address)).to.equal(
          senderBalance.sub(transferAmount)
        );
        expect(await govToken.balanceOf(recipient.address)).to.equal(
          recipientBalance.add(transferAmount)
        );
      });
    });
  });
});
