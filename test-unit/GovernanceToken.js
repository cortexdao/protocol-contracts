const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS, tokenAmountToBigNumber } = require("../utils/helpers");

describe.only("GovernanceToken", () => {
  // signers
  let owner;
  let instanceAdmin;
  let randomUser;
  let locker;

  // deployed contracts
  let proxyAdmin;
  let logic;
  let logicV2;
  let proxy;
  let instance;

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
    [owner, instanceAdmin, randomUser, locker] = await ethers.getSigners();

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    proxyAdmin = await ProxyAdmin.connect(owner).deploy();

    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    logic = await GovernanceToken.connect(owner).deploy();

    const GovernanceTokenV2 = await ethers.getContractFactory(
      "GovernanceTokenV2"
    );
    logicV2 = await GovernanceTokenV2.connect(owner).deploy();

    GovernanceTokenProxy = await ethers.getContractFactory(
      "GovernanceTokenProxy"
    );
    proxy = await GovernanceTokenProxy.connect(owner).deploy(
      logic.address,
      proxyAdmin.address,
      totalSupply
    );
    await proxyAdmin.connect(owner).upgrade(proxy.address, logicV2.address);
    instance = await GovernanceTokenV2.attach(proxy.address);
  });

  describe("Constructor", () => {
    it("Revert on invalid admin address", async () => {
      await expect(
        GovernanceTokenProxy.connect(owner).deploy(
          logic.address,
          ZERO_ADDRESS,
          totalSupply
        )
      ).to.be.reverted;
    });
  });

  describe("initialize", () => {
    it("Owner set correctly", async () => {
      expect(await instance.owner()).to.equal(owner.address);
    });

    it("Name set correctly", async () => {
      expect(await instance.name()).to.equal("APY Governance Token");
    });

    it("Symbol set correctly", async () => {
      expect(await instance.symbol()).to.equal("APY");
    });

    it("Decimals set correctly", async () => {
      expect(await instance.decimals()).to.equal(18);
    });

    it("Revert on sent ETH", async () => {
      await expect(
        owner.sendTransaction({ to: instance.address, value: "10" })
      ).to.be.revertedWith("DONT_SEND_ETHER");
    });

    it("totalSupply is set correctly", async () => {
      expect(await instance.totalSupply()).to.equal(totalSupply);
    });

    it("Owner has total supply", async () => {
      expect(await instance.balanceOf(owner.address)).to.equal(
        await instance.totalSupply()
      );
    });
  });

  describe("setAdminAdddress", () => {
    it("Owner can set", async () => {
      await instance.connect(owner).setAdminAddress(instanceAdmin.address);
      expect(await instance.proxyAdmin()).to.equal(instanceAdmin.address);
    });

    it("Revert on invalid admin address", async () => {
      await expect(
        instance.connect(owner).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });

    it("Unpermissioned cannot set", async () => {
      await expect(
        instance.connect(randomUser).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("setLockEnd", () => {
    it("Owner can set", async () => {
      const timestamp = 1653349667;
      await instance.connect(owner).setLockEnd(timestamp);
      expect(await instance.lockEnd()).to.equal(timestamp);
    });

    it("Unpermissioned cannot set", async () => {
      const timestamp = 1653349667;
      await expect(
        instance.connect(randomUser).setLockEnd(timestamp)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("addLocker", () => {
    it("Owner can add locker", async () => {
      expect(await instance.isLocker(locker.address)).to.be.false;
      await instance.connect(owner).addLocker(locker.address);
      expect(await instance.isLocker(locker.address)).to.be.true;
    });

    it("Unpermissioned cannot add", async () => {
      await expect(
        instance.connect(randomUser).addLocker(locker.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("removeLocker", () => {
    before("add locker", async () => {
      await instance.connect(owner).addLocker(locker.address);
      expect(await instance.isLocker(locker.address)).to.be.true;
    });

    it("Owner can remove locker", async () => {
      await instance.connect(owner).removeLocker(locker.address);
      expect(await instance.isLocker(locker.address)).to.be.false;
    });

    it("Unpermissioned cannot remove", async () => {
      await expect(
        instance.connect(randomUser).removeLocker(locker.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("lockAmount / unlockedAmount", () => {
    let userBalance;

    before("set lock end", async () => {
      const timestamp = (await ethers.provider.getBlock()).timestamp;
      const lockEnd = timestamp + 86400 * 7;
      await instance.connect(owner).setLockEnd(lockEnd);
    });

    before("add locker", async () => {
      await instance.connect(owner).addLocker(locker.address);
      expect(await instance.isLocker(locker.address)).to.be.true;
    });

    before("prepare user APY balance", async () => {
      userBalance = tokenAmountToBigNumber("1000");
      await instance.connect(owner).transfer(randomUser.address, userBalance);
      expect(await instance.unlockedAmount(randomUser.address)).to.equal(
        userBalance
      );
    });

    it("Locker can lock amount", async () => {
      const amount = tokenAmountToBigNumber("100");
      await expect(
        instance.connect(locker).lockAmount(randomUser.address, amount)
      ).to.not.be.reverted;
      expect(await instance.unlockedAmount(randomUser.address)).to.equal(
        userBalance.sub(amount)
      );
    });

    it("Unpermissioned cannot lock", async () => {
      const amount = tokenAmountToBigNumber("100");
      await expect(
        instance.connect(randomUser).lockAmount(randomUser.address, amount)
      ).to.be.reverted;
    });

    it("Cannot lock more than balance", async () => {
      // case 1: lock more than balance at once
      await expect(
        instance
          .connect(locker)
          .lockAmount(randomUser.address, userBalance.add(1))
      ).to.be.revertedWith("AMOUNT_EXCEEDS_UNLOCKED_BALANCE");

      // case 2: lock in stages
      const amount = userBalance.div(2);
      // should be allowed to lock half
      await instance.connect(locker).lockAmount(randomUser.address, amount);
      // cannot lock again with more than half
      expect(await instance.unlockedAmount(randomUser.address)).to.equal(
        amount
      );
      await expect(
        instance.connect(locker).lockAmount(randomUser.address, amount.add(1))
      ).to.be.revertedWith("AMOUNT_EXCEEDS_UNLOCKED_BALANCE");
      // can lock again with half
      await expect(
        instance.connect(locker).lockAmount(randomUser.address, amount)
      ).to.not.be.reverted;
      // everything is locked
      expect(await instance.unlockedAmount(randomUser.address)).to.equal(0);
    });

    it("Cannot `transfer` more than unlocked amount", async () => {
      const amount = tokenAmountToBigNumber("100");
      await instance.connect(locker).lockAmount(randomUser.address, amount);
      const unlockedAmount = await instance.unlockedAmount(randomUser.address);
      console.log("Unlocked amount: %s", unlockedAmount);
      await expect(
        instance
          .connect(randomUser)
          .transfer(owner.address, unlockedAmount.add(1))
      ).to.be.revertedWith("LOCKED_BALANCE");
    });

    it("Can `transfer` up to unlocked amount", async () => {
      const amount = tokenAmountToBigNumber("100");
      await instance.connect(locker).lockAmount(randomUser.address, amount);
      const unlockedAmount = await instance.unlockedAmount(randomUser.address);
      await expect(
        instance.connect(randomUser).transfer(owner.address, unlockedAmount)
      ).to.not.be.reverted;
    });

    it("Can `transfer` locked amount after lock end", async () => {
      expect.fail();
    });

    it("Cannot `transferFrom` more than unlocked amount", async () => {
      expect.fail();
    });

    it("Can `transferFrom` up to unlocked amount", async () => {
      expect.fail();
    });

    it("Can `transferFrom` locked amount after lock end", async () => {
      expect.fail();
    });
  });
});
