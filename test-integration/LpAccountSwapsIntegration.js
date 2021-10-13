const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  FAKE_ADDRESS,
  bytes32,
  tokenAmountToBigNumber,
  getStablecoinAddress,
  acquireToken,
} = require("../utils/helpers");
const { FARM_TOKENS, FARM_TOKEN_POOLS } = require("../utils/constants");

const IAddressRegistryV2 = artifacts.readArtifactSync("IAddressRegistryV2");
const OracleAdapter = artifacts.readArtifactSync("OracleAdapter");

const swapParams = [
  {
    contractName: "CrvToUsdcSwap",
    inTokenAddress: FARM_TOKENS["CRV"],
    outTokenAddress: getStablecoinAddress("USDC", "MAINNET"),
    whaleAddress: FARM_TOKEN_POOLS["CRV"],
  },
  {
    contractName: "CrvToDaiSwap",
    inTokenAddress: FARM_TOKENS["CRV"],
    outTokenAddress: getStablecoinAddress("DAI", "MAINNET"),
    whaleAddress: FARM_TOKEN_POOLS["CRV"],
  },
  {
    contractName: "CrvToUsdtSwap",
    inTokenAddress: FARM_TOKENS["CRV"],
    outTokenAddress: getStablecoinAddress("USDT", "MAINNET"),
    whaleAddress: FARM_TOKEN_POOLS["CRV"],
  },
  {
    contractName: "AaveToUsdcSwap",
    inTokenAddress: FARM_TOKENS["AAVE"],
    outTokenAddress: getStablecoinAddress("USDC", "MAINNET"),
    whaleAddress: FARM_TOKEN_POOLS["AAVE"],
  },
  {
    contractName: "AaveToDaiSwap",
    inTokenAddress: FARM_TOKENS["AAVE"],
    outTokenAddress: getStablecoinAddress("DAI", "MAINNET"),
    whaleAddress: FARM_TOKEN_POOLS["AAVE"],
  },
  {
    contractName: "AaveToUsdtSwap",
    inTokenAddress: FARM_TOKENS["AAVE"],
    outTokenAddress: getStablecoinAddress("USDT", "MAINNET"),
    whaleAddress: FARM_TOKEN_POOLS["AAVE"],
  },
];

describe("LpAccount - Swaps integration", () => {
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
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    // mAPT is never used, but we need to return something as a role
    // is setup for it in the Erc20Allocation constructor
    await addressRegistry.mock.mAptAddress.returns(FAKE_ADDRESS);
  });

  before("Deploy LP Account", async () => {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    proxyAdmin = await ProxyAdmin.deploy();

    const LpAccount = await ethers.getContractFactory("TestLpAccount");
    const logic = await LpAccount.deploy();

    const initData = LpAccount.interface.encodeFunctionData(
      "initialize(address)",
      [addressRegistry.address]
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
    const TvlManager = await ethers.getContractFactory("TvlManager", adminSafe);
    tvlManager = await TvlManager.deploy(addressRegistry.address);

    await addressRegistry.mock.getAddress
      .withArgs(bytes32("tvlManager"))
      .returns(tvlManager.address);

    // Oracle Adapter is locked after adding/removing allocations
    const oracleAdapter = await deployMockContract(deployer, OracleAdapter.abi);
    await oracleAdapter.mock.lock.returns();
    await oracleAdapter.mock.lockFor.returns();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    // deploy and register ERC20 allocation
    const Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    erc20Allocation = await Erc20Allocation.deploy(addressRegistry.address);

    await tvlManager.registerAssetAllocation(erc20Allocation.address);
  });

  swapParams.forEach(
    ({ contractName, inTokenAddress, outTokenAddress, whaleAddress }) => {
      it(contractName, async () => {
        const SwapFactory = await ethers.getContractFactory(contractName);
        const swap = await SwapFactory.deploy();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);

        const inToken = await ethers.getContractAt(
          "IDetailedERC20",
          inTokenAddress
        );
        const outToken = await ethers.getContractAt(
          "IDetailedERC20",
          outTokenAddress
        );
        await erc20Allocation
          .connect(adminSafe)
          ["registerErc20Token(address)"](inToken.address);
        await erc20Allocation
          .connect(adminSafe)
          ["registerErc20Token(address)"](outToken.address);

        const numTokens = "1000";
        const inAmount = tokenAmountToBigNumber(
          numTokens,
          await inToken.decimals()
        );

        await acquireToken(
          whaleAddress,
          lpAccount.address,
          inToken,
          numTokens,
          deployer.address
        );

        const name = await swap.NAME();

        expect(await outToken.balanceOf(lpAccount.address)).to.be.zero;
        await expect(lpAccount.connect(lpSafe).swap(name, inAmount, 0)).to.not
          .be.reverted;
        expect(await outToken.balanceOf(lpAccount.address)).to.be.gt(0);
        expect(await inToken.balanceOf(lpAccount.address)).to.be.zero;
      });
    }
  );
});
