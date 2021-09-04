const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
  bytes32,
} = require("../utils/helpers");
const { STABLECOIN_POOLS } = require("../utils/constants");

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
      contractName: 'Curve3PoolZap',

      swapAddress: '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7',
      swapInterface: 'IStableSwap',
      lpTokenAddress: '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490',
      lpTokenInterface: 'IDetailedERC20',
      gaugeAddress: '0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A',
      gaugeInterface: 'ILiquidityGauge',
      numberOfCoins: 3,
      whaleAddress: STABLECOIN_POOLS["DAI"]
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
    } = curveConstant

    describe.only(`Curve ${contractName} zap`, () => {

      let zap
      let swap
      let lpToken
      let gauge
      let underlyerToken
      const underlyerIndex = 0;

      before("Deploy Zap", async () => {
        const zapFactory = await ethers.getContractFactory(contractName, lpSafe)
        zap = await zapFactory.deploy()
      })

      it("Attach to Mainnet Curve contracts", async () => {
        swap = await ethers.getContractAt(swapInterface, swapAddress, lpSafe)
        lpToken = await ethers.getContractAt(lpTokenInterface, lpTokenAddress, lpSafe)
        gauge = await ethers.getContractAt(gaugeInterface, gaugeAddress, lpSafe)
      })

      it("Fund Zap with Pool Underlyer", async () => {
        const underlyerAddress = await swap.coins(underlyerIndex);
        underlyerToken = await ethers.getContractAt(
          "IDetailedERC20",
          underlyerAddress
        );
        const amount = tokenAmountToBigNumber(
          100000,
          await underlyerToken.decimals()
        );

        await acquireToken(whaleAddress, zap.address, underlyerToken, amount, deployer)
      })

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
      })
    })
  })
});
