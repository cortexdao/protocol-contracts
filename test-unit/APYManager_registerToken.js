const { expect } = require("chai");
const hre = require("hardhat");
const { contract, ethers, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { FAKE_ADDRESS } = require("../utils/helpers");
const { deployMockContract } = waffle;

contract("APYManager: token registration", async (accounts) => {
  const [deployerAddress] = accounts;

  let deployer;
  let manager;
  let executor;

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
    const APYGenericExecutor = await ethers.getContractFactory(
      "APYGenericExecutor"
    );
    executor = await APYGenericExecutor.deploy();
    await executor.deployed();

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
    const proxy = await TransparentUpgradeableProxy.deploy(
      logic.address,
      proxyAdmin.address,
      encodedArg
    );
    await proxy.deployed();

    await proxyAdmin.upgrade(proxy.address, logicV2.address);
    manager = await APYManagerV2.attach(proxy.address);
  });

  describe("Token registration", async () => {
    let strategy;

    before(async () => {
      strategy = await manager.callStatic.deployStrategy(executor.address);
      await manager.deployStrategy(executor.address);
    });

    describe("registerTokens", async () => {
      it("Can register for deployed strategy", async () => {
        const tokens = [];
        await expect(manager.registerTokens(strategy, tokens)).to.not.be
          .reverted;
      });

      it("Revert when registering for non-deployed address", async () => {
        const tokens = [];
        await expect(
          manager.registerTokens(FAKE_ADDRESS, tokens)
        ).to.be.revertedWith("INVALID_STRATEGY");
      });
    });

    it("isTokenRegistered", async () => {
      const tokenMock_1 = await deployMockContract(deployer, []);
      const tokenMock_2 = await deployMockContract(deployer, []);
      const tokenMock_3 = await deployMockContract(deployer, []);
      const tokens = [tokenMock_1.address, tokenMock_2.address];
      await manager.registerTokens(strategy, tokens);

      expect(await manager.isTokenRegistered(tokenMock_1.address)).to.be.true;
      expect(await manager.isTokenRegistered(tokenMock_2.address)).to.be.true;
      expect(await manager.isTokenRegistered(tokenMock_3.address)).to.be.false;
    });

    describe("getTokenAddresses", async () => {
      it("retrieves registered tokens", async () => {
        const tokenMock_1 = await deployMockContract(deployer, []);
        const tokenMock_2 = await deployMockContract(deployer, []);
        const tokens = [tokenMock_1.address, tokenMock_2.address];
        await manager.registerTokens(strategy, tokens);

        expect(await manager.getTokenAddresses()).to.have.members(tokens);
        expect(await manager.getTokenAddresses()).to.have.lengthOf(
          tokens.length
        );
      });

      it("Does not return duplicates", async () => {
        const tokenMock_1 = await deployMockContract(deployer, []);
        const tokenMock_2 = await deployMockContract(deployer, []);
        const tokenMock_3 = await deployMockContract(deployer, []);
        const tokenMock_4 = await deployMockContract(deployer, []);
        const tokenMock_5 = await deployMockContract(deployer, []);

        await manager.registerTokens(strategy, [
          tokenMock_1.address,
          tokenMock_2.address,
        ]);
        await manager.registerTokens(strategy, [tokenMock_3.address]);
        await manager.registerTokens(strategy, [
          tokenMock_2.address,
          tokenMock_4.address,
        ]);
        await manager.registerTokens(strategy, [
          tokenMock_1.address,
          tokenMock_3.address,
        ]);
        await manager.registerTokens(strategy, [tokenMock_5.address]);

        const expectedTokens = [
          tokenMock_1.address,
          tokenMock_2.address,
          tokenMock_3.address,
          tokenMock_4.address,
          tokenMock_5.address,
        ];
        expect(await manager.getTokenAddresses()).to.have.members(
          expectedTokens
        );
        expect(await manager.getTokenAddresses()).to.have.lengthOf(
          expectedTokens.length
        );
      });

      it("Returns tokens from multiple strategies", async () => {
        // deploy another strategy
        const strategy_2 = await manager.callStatic.deployStrategy(
          executor.address
        );
        await manager.deployStrategy(executor.address);

        // register with 1st strategy
        const tokenMock_1 = await deployMockContract(deployer, []);
        const tokenMock_2 = await deployMockContract(deployer, []);
        const tokens = [tokenMock_1.address, tokenMock_2.address];
        await manager.registerTokens(strategy, tokens);

        // register with 2nd strategy
        const tokenMock_3 = await deployMockContract(deployer, []);
        const moreTokens = [tokenMock_2.address, tokenMock_3.address];
        await manager.registerTokens(strategy_2, moreTokens);

        const expectedTokens = [
          tokenMock_1.address,
          tokenMock_2.address,
          tokenMock_3.address,
        ];
        expect(await manager.getTokenAddresses()).to.have.members(
          expectedTokens
        );
        expect(await manager.getTokenAddresses()).to.have.lengthOf(
          expectedTokens.length
        );
      });
    });
  });
});
