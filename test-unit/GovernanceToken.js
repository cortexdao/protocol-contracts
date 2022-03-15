const { assert } = require("chai");
const { artifacts, contract } = require("hardhat");
const { expectRevert, ether } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const GovernanceTokenProxy = artifacts.require("GovernanceTokenProxy");
const GovernanceToken = artifacts.require("GovernanceToken");
const GovernanceTokenV2 = artifacts.require("GovernanceTokenV2");

contract("GovernanceToken Unit Test", async (accounts) => {
  const [owner, instanceAdmin, randomUser] = accounts;

  let proxyAdmin;
  let logic;
  let logicV2;
  let proxy;
  let instance;

  const totalSupply = ether("100000000");

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
    proxyAdmin = await ProxyAdmin.new({ from: owner });
    logic = await GovernanceToken.new({ from: owner });
    logicV2 = await GovernanceTokenV2.new({ from: owner });
    proxy = await GovernanceTokenProxy.new(
      logic.address,
      proxyAdmin.address,
      totalSupply,
      {
        from: owner,
      }
    );
    await proxyAdmin.upgrade(proxy.address, logicV2.address, { from: owner });
    instance = await GovernanceTokenV2.at(proxy.address);
  });

  describe("Constructor", async () => {
    it("Revert on invalid admin address", async () => {
      await expectRevert.unspecified(
        GovernanceTokenProxy.new(logic.address, ZERO_ADDRESS, totalSupply, {
          from: owner,
        })
      );
    });
  });

  describe("initialize", async () => {
    it("Owner set correctly", async () => {
      assert.equal(await instance.owner(), owner);
    });

    it("Name set correctly", async () => {
      assert.equal(await instance.name(), "APY Governance Token");
    });

    it("Symbol set correctly", async () => {
      assert.equal(await instance.symbol(), "APY");
    });

    it("Decimals set correctly", async () => {
      assert.equal(await instance.decimals(), 18);
    });

    it("Revert on sent ETH", async () => {
      await expectRevert(instance.send(10), "DONT_SEND_ETHER");
    });

    it("totalSupply is set correctly", async () => {
      expect(await instance.totalSupply()).to.bignumber.equal(totalSupply);
    });

    it("Owner has total supply", async () => {
      expect(await instance.balanceOf(owner)).to.bignumber.equal(
        await instance.totalSupply()
      );
    });
  });

  describe("setAdminAdddress", async () => {
    it("Owner can set", async () => {
      await instance.setAdminAddress(instanceAdmin, { from: owner });
      assert.equal(await instance.proxyAdmin(), instanceAdmin);
    });

    it("Revert on invalid admin address", async () => {
      await expectRevert(
        instance.setAdminAddress(ZERO_ADDRESS, { from: owner }),
        "INVALID_ADMIN"
      );
    });

    it("Unpermissioned cannot set", async () => {
      await expectRevert(
        instance.setAdminAddress(instanceAdmin, { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("setLockEnd", async () => {
    it("Owner can set", async () => {
      const timestamp = 1653349667;
      await instance.setLockEnd(timestamp, { from: owner });
      assert.equal(await instance.lockEnd(), timestamp);
    });

    it("Unpermissioned cannot set", async () => {
      const timestamp = 1653349667;
      await expectRevert(
        instance.setLockEnd(timestamp, { from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("addLocker", () => {
    it("Owner can add locker", async () => {
      //
    });

    it("Unpermissioned cannot call", async () => {
      //
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
