const hre = require("hardhat");
const { ethers, waffle } = hre;
const { deployMockContract } = waffle;
const { assert, expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const { expectRevert } = require("@openzeppelin/test-helpers");
const { ZERO_ADDRESS, FAKE_ADDRESS } = require("../utils/helpers");

describe("Contract: APYManagerProxy", () => {
  let deployer;
  let randomUser;

  let ProxyAdmin;
  let APYManager;
  let ProxyConstructorArg;
  let TransparentUpgradeableProxy;

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

    APYManager = await ethers.getContractFactory("APYManager");
    logic = await APYManager.deploy();
    await logic.deployed();

    ProxyConstructorArg = await ethers.getContractFactory(
      "ProxyConstructorArg"
    );
    const proxyConstructorArg = await ProxyConstructorArg.deploy();
    await proxyConstructorArg.deployed();
    const encodedArg = await proxyConstructorArg.getEncodedArg(
      proxyAdmin.address
    );

    TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    proxy = await TransparentUpgradeableProxy.deploy(
      logic.address,
      proxyAdmin.address,
      encodedArg
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
    let APYManagerUpgraded;

    beforeEach(async () => {
      APYManagerUpgraded = await ethers.getContractFactory(
        "APYManagerUpgraded"
      );
      manager = await APYManager.attach(proxy.address);
    });

    it("Owner can upgrade logic", async () => {
      // confirm that newlyAddedVariable is not availble within the instance yet
      assert.equal(typeof manager.newlyAddedVariable, "undefined");

      //prematurely point instance to upgraded implementation
      manager = await APYManagerUpgraded.attach(proxy.address);
      assert.equal(typeof manager.newlyAddedVariable, "function");

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(manager.newlyAddedVariable());

      // create the new implementation and point the proxy to it
      const newLogic = await APYManagerUpgraded.deploy();
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
      const newLogic = await APYManagerUpgraded.deploy();
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
      const newLogic = await APYManagerUpgraded.deploy();
      await newLogic.deployed();
      // construct init data
      const initData = APYManagerUpgraded.interface.encodeFunctionData(
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
      manager = await APYManagerUpgraded.attach(proxy.address);
      assert.equal(typeof manager.newlyAddedVariable, "function");

      //function should fail due to the proxy not pointing to the correct implementation
      await expectRevert.unspecified(manager.newlyAddedVariable());

      // create the new implementation and point the proxy to it
      const newLogic = await APYManagerUpgraded.deploy();
      await newLogic.deployed();
      const initData = APYManagerUpgraded.interface.encodeFunctionData(
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

    describe("initialize", () => {
      it("Cannot initialize with zero address", async () => {
        let tempManager = await APYManager.deploy();
        await tempManager.deployed();
        await expect(tempManager.initialize(ZERO_ADDRESS)).to.be.revertedWith(
          "INVALID_ADMIN"
        );
      });
    });

    describe("initializeUpgrade", () => {
      let APYManagerV2;

      before(async () => {
        APYManagerV2 = await ethers.getContractFactory("APYManagerV2");
      });

      it("Cannot initialize with non-contract addresses", async () => {
        const contract = await deployMockContract(deployer, []);

        let newLogic = await APYManagerV2.deploy();
        await newLogic.deployed();

        let initData = APYManagerV2.interface.encodeFunctionData(
          "initializeUpgrade(address,address)",
          [FAKE_ADDRESS, contract.address]
        );
        await expect(
          proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData)
        ).to.be.reverted;

        initData = APYManagerV2.interface.encodeFunctionData(
          "initializeUpgrade(address,address)",
          [contract.address, FAKE_ADDRESS]
        );
        await expect(
          proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData)
        ).to.be.reverted;
      });

      it("Can initialize with contract addresses if address registry is set", async () => {
        const contract = await deployMockContract(deployer, []);

        let newLogic = await APYManagerV2.deploy();
        await newLogic.deployed();

        // address registry was set on the V1 manager deployment, but as a safety check,
        // and since it's not necessarily clear from purely reading smart contract code,
        // we put a "require" for it in the `initializeUpgrade` function.

        // should revert as address registry is unset
        const initData = APYManagerV2.interface.encodeFunctionData(
          "initializeUpgrade(address,address)",
          [contract.address, contract.address]
        );
        await expect(
          proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData)
        ).to.be.reverted;
        // should not revert after setting
        const manager = await APYManager.attach(proxy.address);
        await manager.setAddressRegistry(contract.address);
        await expect(
          proxyAdmin.upgradeAndCall(proxy.address, newLogic.address, initData)
        ).to.not.be.reverted;
      });

      it("upgradeAndCall with initializeUpgrade is successful", async () => {
        let logicV2 = await APYManagerV2.deploy();
        await logicV2.deployed();

        const addressRegistry = await deployMockContract(deployer, []);
        await manager.setAddressRegistry(addressRegistry.address);

        const mApt = await deployMockContract(deployer, []);
        const allocationRegistry = await deployMockContract(deployer, []);
        const initData = APYManagerV2.interface.encodeFunctionData(
          "initializeUpgrade(address,address)",
          [mApt.address, allocationRegistry.address]
        );

        await expect(
          proxyAdmin.upgradeAndCall(proxy.address, logicV2.address, initData)
        ).to.not.be.reverted;
      });
    });
  });
});
