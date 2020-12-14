const { assert } = require("chai");
const { artifacts, contract } = require("hardhat");
const { expectRevert } = require("@openzeppelin/test-helpers");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYAddressRegistryProxy = artifacts.require("APYAddressRegistryProxy");
const APYAddressRegistry = artifacts.require("APYAddressRegistry");

contract("APYAddressRegistry", async (accounts) => {
  const [deployer, admin, randomUser] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;
  let registry;

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
    proxyAdmin = await ProxyAdmin.new({ from: deployer });
    logic = await APYAddressRegistry.new({ from: deployer });
    proxy = await APYAddressRegistryProxy.new(
      logic.address,
      proxyAdmin.address,
      {
        from: deployer,
      }
    );
    registry = await APYAddressRegistry.at(proxy.address);
  });

  describe("Test Constructor", async () => {
    it("Revert when proxy admin is zero address", async () => {
      await expectRevert.unspecified(
        APYAddressRegistryProxy.new(logic.address, ZERO_ADDRESS, {
          from: deployer,
        })
      );
    });
  });

  describe("Defaults", async () => {
    it("Owner is set to deployer", async () => {
      assert.equal(await registry.owner(), deployer);
    });

    it("Revert when ETH is sent", async () => {
      await expectRevert(registry.send(10), "DONT_SEND_ETHER");
    });
  });

  describe("Setting admin address", async () => {
    it("Owner can set to valid address", async () => {
      await registry.setAdminAddress(randomUser, { from: deployer });
      assert.equal(await registry.proxyAdmin(), randomUser);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expectRevert.unspecified(
        registry.setAdminAddress(admin, { from: randomUser })
      );
    });

    it("Cannot set to zero address", async () => {
      await expectRevert.unspecified(
        registry.setAdminAddress(ZERO_ADDRESS, { from: deployer })
      );
    });
  });
});
