const { assert } = require("chai");
const hre = require("hardhat");
const { artifacts, contract, ethers, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { FAKE_ADDRESS } = require("../utils/helpers");
// const ERC20 = artifacts.require("ERC20");
// const APYGenericExecutor = artifacts.require("APYGenericExecutor");
// const Strategy = artifacts.require("Strategy");
const { deployMockContract } = waffle;

const bytes32 = ethers.utils.formatBytes32String;

contract("APYManager: token registration", async (accounts) => {
  const [deployerAddress, admin, randomUser, account1] = accounts;

  let deployer;
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
    deployer = await ethers.provider.getSigner(deployerAddress);

    const APYManager = await ethers.getContractFactory("APYManager");
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const APYManagerV2 = await ethers.getContractFactory("APYManagerV2");
    const ProxyConstructorArg = await ethers.getContractFactory(
      "ProxyConstructorArg"
    );
    const TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    const logic = await APYManager.deploy();
    await logic.deployed();
    const logicV2 = await APYManagerV2.deploy();
    await logicV2.deployed();

    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    const proxyConstructorArg = await ProxyConstructorArg.deploy();
    await proxyConstructorArg.deployed();
    const encodedArg = await proxyConstructorArg.getEncodedArg(
      proxyAdmin.address
    );
    const proxy = await TransparentUpgradeableProxy.new(
      logic.address,
      proxyAdmin.address,
      encodedArg
    );
    await proxy.deployed();

    await proxyAdmin.upgrade(proxy.address, logicV2.address);
    manager = await APYManagerV2.attach(proxy.address);
  });

  describe.only("registerTokens", async () => {
    it("Test can register", async () => {
      const strategy = FAKE_ADDRESS;
      const tokens = [];
      await manager.registerTokens(strategy, tokens);
    });
  });
});
