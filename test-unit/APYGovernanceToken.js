const { ethers, artifacts, contract } = require("@nomiclabs/buidler");
const {
  BN,
  constants,
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const { erc20 } = require("../utils/helpers");
const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYGovernanceTokenProxy = artifacts.require("APYGovernanceTokenProxy");
const APYGovernanceToken = artifacts.require("APYGovernanceToken");

contract("APYGovernanceToken Unit Test", async (accounts) => {
  const [owner, instanceAdmin, randomUser, randomAddress] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;
  let instance;

  const totalSupply = erc20("100000000");

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
    logic = await APYGovernanceToken.new({ from: owner });
    proxy = await APYGovernanceTokenProxy.new(
      logic.address,
      proxyAdmin.address,
      totalSupply,
      {
        from: owner,
      }
    );
    instance = await APYGovernanceToken.at(proxy.address);
  });

  describe("Test Constructor", async () => {
    it("Test params invalid admin", async () => {
      await expectRevert.unspecified(
        APYGovernanceTokenProxy.new(logic.address, ZERO_ADDRESS, totalSupply, {
          from: owner,
        })
      );
    });

    it("Test totalSupply is set", async () => {
      expect(await instance.totalSupply.call()).to.bignumber.equal(totalSupply);
    });

    it("Test owner has total supply", async () => {
      expect(await instance.balanceOf.call(owner)).to.bignumber.equal(
        await instance.totalSupply.call()
      );
    });
  });

  describe("Test Defaults", async () => {
    it("Test Owner", async () => {
      assert.equal(await instance.owner.call(), owner);
    });

    it("Test Pool Token Name", async () => {
      assert.equal(await instance.name.call(), "APY Governance Token");
    });

    it("Test Pool Symbol", async () => {
      assert.equal(await instance.symbol.call(), "APY");
    });

    it("Test Pool Decimals", async () => {
      assert.equal(await instance.decimals.call(), 18);
    });

    it("Test sending Ether", async () => {
      await expectRevert(instance.send(10), "DONT_SEND_ETHER");
    });
  });

  describe("Test setAdminAdddress", async () => {
    it("Test setAdminAddress pass", async () => {
      await instance.setAdminAddress(instanceAdmin, { from: owner });
      assert.equal(await instance.proxyAdmin.call(), instanceAdmin);
    });

    it("Test setAdminAddress invalid admin", async () => {
      await expectRevert.unspecified(
        instance.setAdminAddress(ZERO_ADDRESS, { from: owner })
      );
    });

    it("Test setAdminAddress fail", async () => {
      await expectRevert.unspecified(
        instance.setAdminAddress(instanceAdmin, { from: randomUser })
      );
    });
  });
});
