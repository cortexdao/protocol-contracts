const hre = require("hardhat");
const { ethers, waffle } = hre;
const { deployMockContract } = waffle;
const { assert, expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const { expectRevert } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS, FAKE_ADDRESS } = require("../utils/helpers");

describe("Contract: AccountManagerProxy", () => {
  let deployer;
  let randomUser;

  let ProxyAdmin;
  let AccountManager;
  let AccountManagerProxy;

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
    [deployer, randomUser] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    AccountManager = await ethers.getContractFactory("AccountManager");
    logic = await AccountManager.deploy();
    await logic.deployed();

    const addressRegistry = await deployMockContract(deployer, []);
    AccountManagerProxy = await ethers.getContractFactory(
      "AccountManagerProxy"
    );
    proxy = await AccountManagerProxy.deploy(
      logic.address,
      proxyAdmin.address,
      addressRegistry.address
    );
    await proxy.deployed();
  });

  describe("ProxyAdmin defaults", () => {
    it("ProxyAdmin owner is deployer", async () => {
      expect(await proxyAdmin.owner()).to.equal(deployer.address);
    });

    it("Proxy implementation is set to logic contract", async () => {
      assert.equal(
        await proxyAdmin.getProxyImplementation(proxy.address),
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

  describe("Upgradability", () => {
    let AccountManagerUpgraded;

    beforeEach(async () => {
      AccountManagerUpgraded = await ethers.getContractFactory(
        "AccountManagerUpgraded"
      );
      manager = await AccountManager.attach(proxy.address);
    });

    it("Owner can upgrade logic", async () => {
      // confirm that newlyAddedVariable is not availble within the instance yet
      assert.equal(typeof manager.newlyAddedVariable, "undefined");

      //prematurely point instance to upgraded implementation
      manager = await AccountManagerUpgraded.attach(proxy.address);
      assert.equal(typeof manager.newlyAddedVariable, "function");

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(manager.newlyAddedVariable());

      // create the new implementation and point the proxy to it
      const newLogic = await AccountManagerUpgraded.deploy();
      await newLogic.deployed();
      await proxyAdmin.upgrade(proxy.address, newLogic.address);

      const newVal = await manager.newlyAddedVariable();
      assert.equal(newVal, false);
      assert.equal(
        await proxyAdmin.getProxyImplementation(proxy.address),
        newLogic.address
      );
    });

    it("Revert when non-owner attempts upgrade", async () => {
      const newLogic = await AccountManagerUpgraded.deploy();
      await newLogic.deployed();
      await expectRevert(
        proxyAdmin.connect(randomUser).upgrade(proxy.address, newLogic.address),
        "Ownable: caller is not the owner"
      );
    });

    it("Revert when user attempts to initialize upgrade", async () => {
      await expectRevert(
        manager.connect(randomUser).initializeUpgrade(),
        "ADMIN_ONLY"
      );
    });

    it("Revert when non-admin attempts `upgradeAndCall`", async () => {
      // deploy new implementation
      const newLogic = await AccountManagerUpgraded.deploy();
      await newLogic.deployed();
      // construct init data
      const initData = AccountManagerUpgraded.interface.encodeFunctionData(
        "initializeUpgrade",
        []
      );

      await expectRevert(
        proxyAdmin
          .connect(randomUser)
          .upgradeAndCall(proxy.address, newLogic.address, initData),
        "Ownable: caller is not the owner"
      );
    });

    it("Owner can upgrade logic and initialize", async () => {
      // confirm that newlyAddedVariable is not availble within the instance yet
      assert.equal(typeof manager.newlyAddedVariable, "undefined");

      //prematurely point instance to upgraded implementation
      manager = await AccountManagerUpgraded.attach(proxy.address);
      assert.equal(typeof manager.newlyAddedVariable, "function");

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(manager.newlyAddedVariable());

      // create the new implementation and point the proxy to it
      const newLogic = await AccountManagerUpgraded.deploy();
      await newLogic.deployed();
      const initData = AccountManagerUpgraded.interface.encodeFunctionData(
        "initializeUpgrade",
        []
      );

      await proxyAdmin.upgradeAndCall(
        proxy.address,
        newLogic.address,
        initData
      );

      const newVal = await manager.newlyAddedVariable.call();
      assert.equal(newVal, true);
      assert.equal(
        await proxyAdmin.getProxyImplementation(proxy.address),
        newLogic.address
      );
    });
  });

  describe("initialize", () => {
    it("Cannot initialize with zero admin address", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      const logic = await AccountManager.deploy();
      await logic.deployed();

      await expect(
        AccountManagerProxy.deploy(
          logic.address,
          ZERO_ADDRESS,
          dummyContract.address
        )
      ).to.be.reverted;
    });

    it("Cannot initialize with non-contract address", async () => {
      const logic = await AccountManager.deploy();
      await logic.deployed();

      await expect(
        AccountManagerProxy.deploy(
          logic.address,
          proxyAdmin.address,
          FAKE_ADDRESS
        )
      ).to.be.reverted;
    });

    it("deploy initializes correctly", async () => {
      const logic = await AccountManager.deploy();
      await logic.deployed();

      const addressRegistry = await deployMockContract(deployer, []);

      const proxy = await AccountManagerProxy.deploy(
        logic.address,
        proxyAdmin.address,
        addressRegistry.address
      );
      const manager = await AccountManager.attach(proxy.address);

      expect(await manager.owner()).to.equal(deployer.address);
      expect(await manager.proxyAdmin()).to.equal(proxyAdmin.address);
      expect(await manager.addressRegistry()).to.equal(addressRegistry.address);
    });
  });
});
