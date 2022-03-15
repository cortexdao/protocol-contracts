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
      expect(instance.isLocker(locker.address)).to.be.false;
      await instance.connect(owner).addLocker(locker.address);
      expect(instance.isLocker(locker.address)).to.be.true;
    });

    it("Unpermissioned cannot call", async () => {
      await expect(
        instance.connect(randomUser).addLocker(locker.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("removeLocker", () => {
    it("Owner can remove locker", async () => {
      //
    });

    it("Unpermissioned cannot call", async () => {
      //
    });
  });

  describe("lockAmount / unlockedAmount", () => {
    it("Locker can call", async () => {
      //
    });

    it("Unpermissioned cannot call", async () => {
      //
    });

    it("Can lock specified amount", async () => {
      //
    });

    it("Can read unlocked amount", async () => {
      //
    });

    it("Cannot `transfer` more than unlocked amount", async () => {
      //
    });

    it("Can `transfer` up to unlocked amount", async () => {
      //
    });

    it("Can `transfer` locked amount after lock end", async () => {
      //
    });

    it("Cannot `transferFrom` more than unlocked amount", async () => {
      //
    });

    it("Can `transferFrom` up to unlocked amount", async () => {
      //
    });

    it("Can `transferFrom` locked amount after lock end", async () => {
      //
    });
  });
});
