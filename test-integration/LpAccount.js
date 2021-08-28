const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  FAKE_ADDRESS,
  bytes32,
  tokenAmountToBigNumber,
} = require("../utils/helpers");

const IAddressRegistryV2 = artifacts.readArtifactSync("IAddressRegistryV2");
const IDetailedERC20 = artifacts.readArtifactSync("IDetailedERC20");
const IAssetAllocation = artifacts.readArtifactSync("IAssetAllocation");
const OracleAdapter = artifacts.readArtifactSync("OracleAdapter");

async function deployMockZap(name) {
  const TestZap = await ethers.getContractFactory("TestZap");
  const zap = await TestZap.deploy(name || "mockZap");
  return zap;
}

async function deployMockAllocation(name) {
  const [deployer] = await ethers.getSigners();
  const allocation = await deployMockContract(deployer, IAssetAllocation.abi);
  await allocation.mock.NAME.returns(name || "mockAllocation");
  return allocation;
}

async function deployMockErc20(symbol, decimals) {
  const [deployer] = await ethers.getSigners();
  const token = await deployMockContract(deployer, IDetailedERC20.abi);
  await token.mock.symbol.returns(symbol || "MOCK");
  await token.mock.decimals.returns(Number(decimals) || 18);
  return token;
}

describe("Contract: LpAccount", () => {
  // signers
  let deployer;
  let lpSafe;
  let emergencySafe;
  let adminSafe;

  // deployed contracts
  let lpAccount;
  let proxyAdmin;
  let tvlManager;
  let erc20Allocation;

  // mocks
  let addressRegistry;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Setup mock address registry", async () => {
    [deployer, lpSafe, emergencySafe, adminSafe] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      IAddressRegistryV2.abi
    );

    // These registered addresses are setup for roles in the
    // constructor for LpAccount
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("adminSafe"))
      .returns(adminSafe.address);
  });

  before("Deploy LP Account", async () => {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    proxyAdmin = await ProxyAdmin.deploy();

    const LpAccount = await ethers.getContractFactory("TestLpAccount");
    const logic = await LpAccount.deploy();

    const initData = LpAccount.interface.encodeFunctionData(
      "initialize(address,address)",
      [proxyAdmin.address, addressRegistry.address]
    );

    const TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    const proxy = await TransparentUpgradeableProxy.deploy(
      logic.address,
      proxyAdmin.address,
      initData
    );

    lpAccount = await LpAccount.attach(proxy.address);
  });

  before("Prepare TVL Manager and ERC20 Allocation", async () => {
    // deploy and register TVL Manager
    const TvlManager = await ethers.getContractFactory("TvlManager", lpSafe);
    tvlManager = await TvlManager.deploy(addressRegistry.address);

    await addressRegistry.mock.getAddress
      .withArgs(bytes32("tvlManager"))
      .returns(tvlManager.address);

    // Oracle Adapter is locked after adding/removing allocations
    const oracleAdapter = await deployMockContract(deployer, OracleAdapter.abi);
    await oracleAdapter.mock.lock.returns();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    // mAPT is never used, but we need to return something as a role
    // is setup for it in the Erc20Allocation constructor
    await addressRegistry.mock.mAptAddress.returns(FAKE_ADDRESS);

    // deploy and register ERC20 allocation
    const Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    erc20Allocation = await Erc20Allocation.deploy(addressRegistry.address);

    await tvlManager.registerAssetAllocation(erc20Allocation.address);
  });

  describe("deployStrategy", () => {
    it("can deploy", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      await lpAccount.connect(lpSafe).deployStrategy(name, amounts);
      expect(await lpAccount._deployCalls()).to.deep.equal([amounts]);
    });

    it("cannot deploy with unregistered allocation", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with unregistered allocation
      const allocation = await deployMockAllocation();
      await zap._setAssetAllocations([allocation.address]);

      await expect(
        lpAccount.connect(lpSafe).deployStrategy(name, amounts)
      ).to.be.revertedWith("MISSING_ASSET_ALLOCATIONS");
    });

    it("cannot deploy with registered and unregistered allocations", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with a registered and an unregistered allocation
      const allocation_0 = await deployMockAllocation("allocation 0");
      const allocation_1 = await deployMockAllocation("allocation 1");
      await tvlManager.registerAssetAllocation(allocation_1.address);
      await zap._setAssetAllocations([
        allocation_0.address,
        allocation_1.address,
      ]);

      await expect(
        lpAccount.connect(lpSafe).deployStrategy(name, amounts)
      ).to.be.revertedWith("MISSING_ASSET_ALLOCATIONS");
    });

    it("can deploy with registered allocations", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with registered allocations
      const allocation_0 = await deployMockAllocation("allocation 0");
      const allocation_1 = await deployMockAllocation("allocation 1");
      await tvlManager.registerAssetAllocation(allocation_0.address);
      await tvlManager.registerAssetAllocation(allocation_1.address);
      await zap._setAssetAllocations([
        allocation_0.address,
        allocation_1.address,
      ]);

      await expect(lpAccount.connect(lpSafe).deployStrategy(name, amounts)).to
        .not.be.reverted;
    });

    it("cannot deploy with unregistered ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with unregistered ERC20
      const token = await deployMockErc20();
      await zap._setErc20Allocations([token.address]);

      await expect(
        lpAccount.connect(lpSafe).deployStrategy(name, amounts)
      ).to.be.revertedWith("MISSING_ERC20_ALLOCATIONS");
    });

    it("can deploy with registered ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with registered ERC20
      const token = await deployMockErc20();
      await erc20Allocation
        .connect(lpSafe)
        ["registerErc20Token(address)"](token.address);
      await zap._setErc20Allocations([token.address]);

      await expect(lpAccount.connect(lpSafe).deployStrategy(name, amounts)).to
        .not.be.reverted;
    });

    it("can deploy with registered allocation and ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with registered allocation
      const allocation = await deployMockAllocation();
      await tvlManager.registerAssetAllocation(allocation.address);
      await zap._setAssetAllocations([allocation.address]);

      // configure zap with registered ERC20
      const token = await deployMockErc20();
      await erc20Allocation
        .connect(lpSafe)
        ["registerErc20Token(address)"](token.address);
      await zap._setErc20Allocations([token.address]);

      await expect(lpAccount.connect(lpSafe).deployStrategy(name, amounts)).to
        .not.be.reverted;
    });

    it("cannot deploy with registered allocation but unregistered ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with registered allocation
      const allocation = await deployMockAllocation();
      await tvlManager.registerAssetAllocation(allocation.address);
      await zap._setAssetAllocations([allocation.address]);

      // configure zap with unregistered ERC20
      const token = await deployMockErc20();
      await zap._setErc20Allocations([token.address]);

      await expect(
        lpAccount.connect(lpSafe).deployStrategy(name, amounts)
      ).to.be.revertedWith("MISSING_ERC20_ALLOCATIONS");
    });

    it("cannot deploy with unregistered allocation but registered ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with unregistered allocation
      const allocation = await deployMockAllocation();
      await zap._setAssetAllocations([allocation.address]);

      // configure zap with registered ERC20
      const token = await deployMockErc20();
      await erc20Allocation
        .connect(lpSafe)
        ["registerErc20Token(address)"](token.address);
      await zap._setErc20Allocations([token.address]);

      await expect(
        lpAccount.connect(lpSafe).deployStrategy(name, amounts)
      ).to.be.revertedWith("MISSING_ASSET_ALLOCATIONS");
    });
  });

  describe("unwindStrategy", () => {
    it("can unwind", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amount = tokenAmountToBigNumber(100);

      await lpAccount.connect(lpSafe).unwindStrategy(name, amount);
      expect(await lpAccount._unwindCalls()).to.deep.equal([amount]);
    });
  });
});
