const { assert } = require("chai");
const { ethers, artifacts, contract } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const { expectRevert } = require("@openzeppelin/test-helpers");

const ProxyAdmin = artifacts.require("ProxyAdmin");
const AddressRegistryUpgraded = artifacts.require("AddressRegistryUpgraded");
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
  let manager;

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
  });

  describe("ProxyAdmin defaults", async () => {
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
  });

  describe("Upgradability", async () => {
    beforeEach(async () => {
      manager = await AddressRegistry.at(proxy.address);
    });

    it("Owner can upgrade logic", async () => {
      // confirm that newlyAddedVariable is not availble within the instance yet
      assert.equal(typeof manager.newlyAddedVariable, "undefined");

      //prematurely point instance to upgraded implementation
      manager = await AddressRegistryUpgraded.at(proxy.address);
      assert.equal(typeof manager.newlyAddedVariable, "function");

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(manager.newlyAddedVariable());

      // create the new implementation and point the proxy to it
      const newLogic = await AddressRegistryUpgraded.new({ from: deployer });
      await proxyAdmin.upgrade(proxy.address, newLogic.address, {
        from: deployer,
      });

      const newVal = await manager.newlyAddedVariable();
      assert.equal(newVal, false);
      assert.equal(
        await proxyAdmin.getProxyImplementation(proxy.address, {
          from: deployer,
        }),
        newLogic.address
      );
    });

    it("Revert when non-owner attempts upgrade", async () => {
      const newLogic = await AddressRegistryUpgraded.new({ from: deployer });
      await expectRevert(
        proxyAdmin.upgrade(proxy.address, newLogic.address, {
          from: randomUser,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Revert when user attempts to initialize upgrade", async () => {
      await expectRevert(
        manager.initializeUpgrade({ from: randomUser }),
        "ADMIN_ONLY"
      );
    });

    it("Revert when non-admin attempts `upgradeAndCall`", async () => {
      // deploy new implementation
      const newLogic = await AddressRegistryUpgraded.new({ from: deployer });
      // construct init data
      const iImplementation = new ethers.utils.Interface(
        AddressRegistryUpgraded.abi
      );
      const initData = iImplementation.encodeFunctionData(
        "initializeUpgrade",
        []
      );

      await expectRevert(
        proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData, {
          from: randomUser,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Owner can upgrade logic and initialize", async () => {
      // confirm that newlyAddedVariable is not availble within the instance yet
      assert.equal(typeof manager.newlyAddedVariable, "undefined");

      //prematurely point instance to upgraded implementation
      manager = await AddressRegistryUpgraded.at(proxy.address);
      assert.equal(typeof manager.newlyAddedVariable, "function");

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(manager.newlyAddedVariable());

      // create the new implementation and point the proxy to it
      const newLogic = await AddressRegistryUpgraded.new({ from: deployer });
      const iImplementation = new ethers.utils.Interface(
        AddressRegistryUpgraded.abi
      );
      const initData = iImplementation.encodeFunctionData(
        "initializeUpgrade",
        []
      );

      await proxyAdmin.upgradeAndCall(
        proxy.address,
        newLogic.address,
        initData,
        { from: deployer }
      );

      const newVal = await manager.newlyAddedVariable.call();
      assert.equal(newVal, true);
      assert.equal(
        await proxyAdmin.getProxyImplementation(proxy.address, {
          from: deployer,
        }),
        newLogic.address
      );
    });
  });
});
