const { assert, expect } = require("chai");
const { artifacts, contract } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const { expectRevert } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const TransparentUpgradeableProxy = artifacts.require(
  "TransparentUpgradeableProxy"
);
const ProxyConstructorArg = artifacts.require("ProxyConstructorArg");
const AddressRegistry = artifacts.require("AddressRegistry");

contract("AddressRegistryProxy", async (accounts) => {
  const [deployer, randomUser] = accounts;

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
    logic = await AddressRegistry.new({ from: deployer });
    const encodedArg = await (await ProxyConstructorArg.new()).getEncodedArg(
      proxyAdmin.address
    );
    proxy = await TransparentUpgradeableProxy.new(
      logic.address,
      proxyAdmin.address,
      encodedArg,
      {
        from: deployer,
      }
    );

    registry = await AddressRegistry.at(proxy.address);
  });

  describe("Defaults", async () => {
    it("ProxyAdmin owner is deployer", async () => {
      assert.equal(await proxyAdmin.owner(), deployer);
    });

    it("Proxy implementation is set to logic contract", async () => {
      assert.equal(
        await proxyAdmin.getProxyImplementation(proxy.address, {
          from: deployer,
        }),
        logic.address
      );
    });

    it("Proxy's admin is ProxyAdmin", async () => {
      assert.equal(
        await proxyAdmin.getProxyAdmin(proxy.address),
        proxyAdmin.address
      );
    });

    it("proxyAdmin() is set to proxy admin", async () => {
      expect(await registry.proxyAdmin()).to.equal(proxyAdmin.address);
    });
  });

  describe("Initialization", async () => {
    it("Cannot call `initialize` after deploy", async () => {
      await expectRevert(
        registry.initialize(proxyAdmin.address, { from: randomUser }),
        "Contract instance has already been initialized"
      );
    });

    it("Revert when non-admin attempts `initializeUpgrade`", async () => {
      await expectRevert(
        registry.initializeUpgrade({ from: randomUser }),
        "ADMIN_ONLY"
      );
    });

    it("Cannot initialize with zero admin address", async () => {
      const encodedArg = await (await ProxyConstructorArg.new()).getEncodedArg(
        ZERO_ADDRESS
      );
      await expect(
        TransparentUpgradeableProxy.new(
          logic.address,
          proxyAdmin.address,
          encodedArg,
          {
            from: deployer,
          }
        )
      ).to.be.reverted;
    });
  });
});
