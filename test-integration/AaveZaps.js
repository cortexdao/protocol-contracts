const hre = require("hardhat");
const { expect } = require("chai");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Zaps", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let lpSafe;
  let mApt;

  /* contract factories */
  let TvlManager;

  /* deployed contracts */
  let tvlManager;

  // use EVM snapshots for test isolation
  let snapshotId;

  const AaveConstants = [
    {
      contractName: "AaveDaiZap",
      underlyerAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      lpTokenAddress: "0x028171bCA77440897B824Ca71D1c56caC55b68A3",
      whaleAddress: WHALE_POOLS["DAI"],
    },
    {
      contractName: "AaveUsdcZap",
      underlyerAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      lpTokenAddress: "0xBcca60bB61934080951369a648Fb03DF4F96263C",
      whaleAddress: WHALE_POOLS["USDC"],
    },
    {
      contractName: "AaveUsdtZap",
      underlyerAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      lpTokenAddress: "0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811",
      whaleAddress: WHALE_POOLS["USDT"],
    },
  ];

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [deployer, emergencySafe, lpSafe, mApt] = await ethers.getSigners();

    const addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );

    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.require("ILockingOracle").abi
    );
    await oracleAdapter.mock.lock.returns();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    /* These registered addresses are setup for roles in the
     * constructor for Erc20Allocation:
     * - emergencySafe (default admin role)
     * - lpSafe (LP role)
     * - mApt (contract role)
     */
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.mAptAddress.returns(mApt.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);

    const Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    const erc20Allocation = await Erc20Allocation.deploy(
      addressRegistry.address
    );

    /* These registered addresses are setup for roles in the
     * constructor for TvlManager
     * - lpSafe (LP role)
     * - emergencySafe (emergency role, default admin role)
     */
    TvlManager = await ethers.getContractFactory("TvlManager");
    tvlManager = await TvlManager.deploy(addressRegistry.address);
    await tvlManager
      .connect(lpSafe)
      .registerAssetAllocation(erc20Allocation.address);
  });

  AaveConstants.forEach((curveConstant) => {
    const {
      contractName,
      underlyerAddress,
      lpTokenAddress,
      whaleAddress,
    } = curveConstant;

    describe(`Curve ${contractName} zap`, () => {
      let zap;
      let lpToken;
      let underlyerToken;

      before("Deploy Zap", async () => {
        const zapFactory = await ethers.getContractFactory(
          contractName,
          lpSafe
        );
        zap = await zapFactory.deploy();
      });

      before("Attach to Mainnet Curve contracts", async () => {
        lpToken = await ethers.getContractAt(
          "IDetailedERC20",
          lpTokenAddress,
          lpSafe
        );
      });

      before("Fund Zap with Pool Underlyer", async () => {
        underlyerToken = await ethers.getContractAt(
          "IDetailedERC20",
          underlyerAddress
        );
        const amount = tokenAmountToBigNumber(
          100000,
          await underlyerToken.decimals()
        );

        await acquireToken(
          whaleAddress,
          zap.address,
          underlyerToken,
          amount,
          deployer
        );
      });

      it("Deposit into pool and stake", async () => {
        const amounts = new Array(1).fill("0");
        const underlyerAmount = tokenAmountToBigNumber(
          1000,
          await underlyerToken.decimals()
        );
        amounts[0] = underlyerAmount;

        const deployedZapUnderlyerInitial = await underlyerToken.balanceOf(
          zap.address
        );
        expect(deployedZapUnderlyerInitial).gt(0);

        await zap.deployLiquidity(amounts);

        const deployedZapUnderlyerBalance = await underlyerToken.balanceOf(
          zap.address
        );
        expect(deployedZapUnderlyerBalance).gt(0);
        const deployedZapLpBalance = await lpToken.balanceOf(zap.address);
        expect(deployedZapLpBalance).gt(0);

        await zap.unwindLiquidity(deployedZapLpBalance);

        const withdrawnZapUnderlyerBalance = await underlyerToken.balanceOf(
          zap.address
        );
        expect(withdrawnZapUnderlyerBalance).gt(deployedZapUnderlyerBalance);
        const withdrawnZapLpBalance = await lpToken.balanceOf(zap.address);
        expect(withdrawnZapLpBalance).to.equal(0);
      });
    });
  });
});
