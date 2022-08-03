const hre = require("hardhat");
const { expect } = require("chai");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
  getStablecoinAddress,
  FAKE_ADDRESS,
  bytes32,
} = require("../utils/helpers");
const { FARM_TOKENS, FARM_TOKEN_POOLS } = require("../utils/constants");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

const pinnedBlock = 15085764;
const defaultPinnedBlock = hre.config.networks.hardhat.forking.blockNumber;
const forkingUrl = hre.config.networks.hardhat.forking.url;

const swapParams = [
  {
    swapContractName: "CrvToDaiSwap",
    inTokenSymbol: "CRV",
    outTokenSymbol: "DAI",
  },
  {
    swapContractName: "CrvToUsdcSwap",
    inTokenSymbol: "CRV",
    outTokenSymbol: "USDC",
  },
  {
    swapContractName: "CrvToUsdtSwap",
    inTokenSymbol: "CRV",
    outTokenSymbol: "USDT",
  },
  {
    swapContractName: "CvxToUsdcSwap",
    inTokenSymbol: "CVX",
    outTokenSymbol: "USDC",
  },
  {
    swapContractName: "AaveToDaiSwap",
    inTokenSymbol: "AAVE",
    outTokenSymbol: "DAI",
  },
  {
    swapContractName: "AaveToUsdcSwap",
    inTokenSymbol: "AAVE",
    outTokenSymbol: "USDC",
  },
  {
    swapContractName: "AaveToUsdtSwap",
    inTokenSymbol: "AAVE",
    outTokenSymbol: "USDT",
  },
  {
    swapContractName: "SnxToUsdcSwap",
    inTokenSymbol: "SNX",
    outTokenSymbol: "USDC",
  },
];

describe("Swaps - LP Account integration", () => {
  const NETWORK = "MAINNET";

  /* signers */
  let deployer;
  let emergencySafe;
  let adminSafe;
  let lpSafe;

  /* deployed contracts */
  let lpAccount;
  let tvlManager;
  let erc20Allocation;

  /* mocks */
  let addressRegistry;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Use pinned block for new swaps", async () => {
    await hre.network.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: forkingUrl,
          blockNumber: pinnedBlock,
        },
      },
    ]);
  });

  after("Reset pinned block", async () => {
    await hre.network.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: forkingUrl,
          blockNumber: defaultPinnedBlock,
        },
      },
    ]);
  });

  before("Setup mock address registry", async () => {
    [deployer, lpSafe, emergencySafe, adminSafe] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IAddressRegistryV2").abi
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
    const proxyAdmin = await ProxyAdmin.deploy();

    const LpAccount = await ethers.getContractFactory("LpAccount");
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
    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("OracleAdapter").abi
    );
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

  swapParams.forEach(function (params) {
    const { swapContractName, inTokenSymbol, outTokenSymbol } = params;

    describe(swapContractName, () => {
      let swap;
      let inToken;
      let outToken;

      let whaleAddress = FARM_TOKEN_POOLS[inTokenSymbol];

      before("Deploy swap contract", async () => {
        const SwapContract = await ethers.getContractFactory(swapContractName);
        swap = await SwapContract.deploy();
      });

      before("Register swap with LP Account", async () => {
        await lpAccount.connect(adminSafe).registerSwap(swap.address);
      });

      before("Fund LP Account with in-token", async () => {
        inToken = await ethers.getContractAt(
          "IDetailedERC20",
          FARM_TOKENS[inTokenSymbol]
        );

        const amount = tokenAmountToBigNumber(1000, await inToken.decimals());
        const sender = whaleAddress;
        await acquireToken(
          sender,
          lpAccount.address,
          inToken,
          amount,
          deployer
        );
      });

      before("Attach to out-token", async () => {
        const outTokenAddress = getStablecoinAddress(outTokenSymbol, NETWORK);
        outToken = await ethers.getContractAt(
          "IDetailedERC20",
          outTokenAddress
        );
      });

      before("Register tokens with ERC20 Allocation", async () => {
        await erc20Allocation
          .connect(adminSafe)
          ["registerErc20Token(address)"](inToken.address);
        await erc20Allocation
          .connect(adminSafe)
          ["registerErc20Token(address)"](outToken.address);
      });

      it("Swap in-token for out-token", async () => {
        let inTokenBalance = await inToken.balanceOf(lpAccount.address);
        expect(inTokenBalance).to.be.gt(0);
        expect(await outToken.balanceOf(lpAccount.address)).to.be.zero;

        const name = await swap.NAME();
        await lpAccount.connect(lpSafe).swap(name, inTokenBalance, 0);

        expect(await inToken.balanceOf(lpAccount.address)).to.equal(0);
        expect(await outToken.balanceOf(lpAccount.address)).to.be.gt(0);
      });
    });
  });
});
