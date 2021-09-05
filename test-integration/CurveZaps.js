const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
  bytes32,
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

  const CurveConstants = [
    {
      contractName: "Curve3PoolZap",
      swapAddress: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
      lpTokenInterface: "IDetailedERC20",
      gaugeAddress: "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 3,
      whaleAddress: WHALE_POOLS["DAI"],
    },
    {
      contractName: "AavePoolZap",
      swapAddress: "0xDeBF20617708857ebe4F679508E7b7863a8A8EeE",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900",
      lpTokenInterface: "IDetailedERC20",
      gaugeAddress: "0xd662908ADA2Ea1916B3318327A97eB18aD588b5d",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 3,
      whaleAddress: WHALE_POOLS["ADAI"],
    },
    {
      contractName: "AlUsdPoolZap",
      swapAddress: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
      lpTokenInterface: "IDetailedERC20",
      gaugeAddress: "0x9582C4ADACB3BCE56Fea3e590F05c3ca2fb9C477",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["ALUSD"],
    },
    {
      contractName: "BusdV2PoolZap",
      swapAddress: "0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
      lpTokenInterface: "IDetailedERC20",
      gaugeAddress: "0xd4B22fEdcA85E684919955061fDf353b9d38389b",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["BUSD"],
    },
    {
      contractName: "CompoundPoolZap",
      swapAddress: "0xA2B47E3D5c44877cca798226B7B8118F9BFb7A56",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2",
      lpTokenInterface: "IDetailedERC20",
      gaugeAddress: "0x7ca5b0a2910B33e9759DC7dDB0413949071D7575",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["CDAI"],
    },
    {
      contractName: "FraxPoolZap",
      swapAddress: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
      lpTokenInterface: "IDetailedERC20",
      gaugeAddress: "0x72E158d38dbd50A483501c24f792bDAAA3e7D55C",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["FRAX"],
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
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistry.mock.mAptAddress.returns(mApt.address);

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

  CurveConstants.forEach((curveConstant) => {
    const {
      contractName,
      swapAddress,
      swapInterface,
      lpTokenAddress,
      lpTokenInterface,
      gaugeAddress,
      gaugeInterface,
      numberOfCoins,
      whaleAddress,
    } = curveConstant;

    describe.only(`Curve ${contractName} zap`, () => {
      let zap;
      let swap;
      let lpToken;
      let gauge;
      let underlyerToken;
      const underlyerIndex = 0;

      before("Deploy Zap", async () => {
        const zapFactory = await ethers.getContractFactory(
          contractName,
          lpSafe
        );
        zap = await zapFactory.deploy();
      });

      before("Attach to Mainnet Curve contracts", async () => {
        swap = await ethers.getContractAt(swapInterface, swapAddress, lpSafe);
        lpToken = await ethers.getContractAt(
          lpTokenInterface,
          lpTokenAddress,
          lpSafe
        );
        gauge = await ethers.getContractAt(
          gaugeInterface,
          gaugeAddress,
          lpSafe
        );
      });

      before("Fund Zap with Pool Underlyer", async () => {
        const underlyerAddress = await swap.coins(underlyerIndex);
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
        const amounts = new Array(numberOfCoins).fill("0");
        const underlyerAmount = tokenAmountToBigNumber(
          1000,
          await underlyerToken.decimals()
        );
        amounts[underlyerIndex] = underlyerAmount;

        await zap.deployLiquidity(amounts);

        const zapLpBalance = await lpToken.balanceOf(zap.address);
        console.log("zap LP token balance:", zapLpBalance.toString());
        const gaugeLpBalance = await gauge.balanceOf(zap.address);
        console.log("gauge LP token balance:", gaugeLpBalance.toString());

        await zap.unwindLiquidity(gaugeLpBalance);
        // TODO: check all balances
        const zapUnderlyerBalance = await underlyerToken.balanceOf(zap.address);
        console.log("zap underlyer balance:", zapUnderlyerBalance.toString());
      });
    });
  });
});
