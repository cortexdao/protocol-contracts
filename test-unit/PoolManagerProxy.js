const hre = require("hardhat");
const { ethers, waffle } = hre;
const { deployMockContract } = waffle;
const { assert, expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const { expectRevert } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS, FAKE_ADDRESS } = require("../utils/helpers");

describe("Contract: APYPoolManagerProxy", () => {
  let deployer;
  let randomUser;

  let ProxyAdmin;
  let APYPoolManager;
  let APYPoolManagerProxy;

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

    APYPoolManager = await ethers.getContractFactory("APYPoolManager");
    logic = await APYPoolManager.deploy();
    await logic.deployed();

    const mApt = await deployMockContract(deployer, []);
    const addressRegistry = await deployMockContract(deployer, []);
    APYPoolManagerProxy = await ethers.getContractFactory(
      "APYPoolManagerProxy"
    );
    proxy = await APYPoolManagerProxy.deploy(
      logic.address,
      proxyAdmin.address,
      mApt.address,
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
    let APYPoolManagerUpgraded;

    beforeEach(async () => {
      APYPoolManagerUpgraded = await ethers.getContractFactory(
        "APYPoolManagerUpgraded"
      );
      manager = await APYPoolManager.attach(proxy.address);
    });

    it("Owner can upgrade logic", async () => {
      // confirm that newlyAddedVariable is not availble within the instance yet
      assert.equal(typeof manager.newlyAddedVariable, "undefined");

      //prematurely point instance to upgraded implementation
      manager = await APYPoolManagerUpgraded.attach(proxy.address);
      assert.equal(typeof manager.newlyAddedVariable, "function");

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(manager.newlyAddedVariable());

      // create the new implementation and point the proxy to it
      const newLogic = await APYPoolManagerUpgraded.deploy();
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
      const newLogic = await APYPoolManagerUpgraded.deploy();
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
      const newLogic = await APYPoolManagerUpgraded.deploy();
      await newLogic.deployed();
      // construct init data
      const initData = APYPoolManagerUpgraded.interface.encodeFunctionData(
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
      manager = await APYPoolManagerUpgraded.attach(proxy.address);
      assert.equal(typeof manager.newlyAddedVariable, "function");

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(manager.newlyAddedVariable());

      // create the new implementation and point the proxy to it
      const newLogic = await APYPoolManagerUpgraded.deploy();
      await newLogic.deployed();
      const initData = APYPoolManagerUpgraded.interface.encodeFunctionData(
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
      const logic = await APYPoolManager.deploy();
      await logic.deployed();

      await expect(
        APYPoolManagerProxy.deploy(
          logic.address,
          ZERO_ADDRESS,
          dummyContract.address,
          dummyContract.address
        )
      ).to.be.reverted;
    });

    it("Cannot initialize with non-contract addresses", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      const logic = await APYPoolManager.deploy();
      await logic.deployed();

      await expect(
        APYPoolManagerProxy.deploy(
          logic.address,
          proxyAdmin.address,
          FAKE_ADDRESS,
          dummyContract.address
        )
      ).to.be.reverted;

      await expect(
        APYPoolManagerProxy.deploy(
          logic.address,
          proxyAdmin.address,
          dummyContract.address,
          FAKE_ADDRESS
        )
      ).to.be.reverted;
    });

    it("deploy initializes correctly", async () => {
      const logic = await APYPoolManager.deploy();
      await logic.deployed();

      const mApt = await deployMockContract(deployer, []);
      const addressRegistry = await deployMockContract(deployer, []);

      const proxy = await APYPoolManagerProxy.deploy(
        logic.address,
        proxyAdmin.address,
        mApt.address,
        addressRegistry.address
      );
      const manager = await APYPoolManager.attach(proxy.address);

      expect(await manager.owner()).to.equal(deployer.address);
      expect(await manager.proxyAdmin()).to.equal(proxyAdmin.address);
      expect(await manager.addressRegistry()).to.equal(addressRegistry.address);
      expect(await manager.mApt()).to.equal(mApt.address);
    });
  });
});
