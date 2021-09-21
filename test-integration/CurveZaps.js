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

const CRV_ADDRESS = "0xD533a949740bb3306d119CC777fa900bA034cd52";

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Curve Zaps", () => {
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
      gaugeAddress: "0xd662908ADA2Ea1916B3318327A97eB18aD588b5d",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 3,
      whaleAddress: WHALE_POOLS["DAI"],
      useUnwrapped: true,
    },
    {
      contractName: "AlUsdPoolZap",
      swapAddress: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
      gaugeAddress: "0x9582C4ADACB3BCE56Fea3e590F05c3ca2fb9C477",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["ALUSD"],
      rewardToken: "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF",
    },
    {
      contractName: "BusdV2PoolZap",
      swapAddress: "0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
      gaugeAddress: "0xd4B22fEdcA85E684919955061fDf353b9d38389b",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["BUSD"],
    },
    {
      contractName: "CompoundPoolZap",
      swapAddress: "0xeB21209ae4C2c9FF2a86ACA31E123764A3B6Bc06",
      swapInterface: "IDepositZap",
      lpTokenAddress: "0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2",
      gaugeAddress: "0x7ca5b0a2910B33e9759DC7dDB0413949071D7575",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["DAI"],
      useUnwrapped: true,
    },
    {
      contractName: "FraxPoolZap",
      swapAddress: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
      gaugeAddress: "0x72E158d38dbd50A483501c24f792bDAAA3e7D55C",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["FRAX"],
      rewardToken: "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0",
    },
    {
      contractName: "IronBankPoolZap",
      swapAddress: "0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x5282a4eF67D9C33135340fB3289cc1711c13638C",
      gaugeAddress: "0xF5194c3325202F456c95c1Cf0cA36f8475C1949F",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 3,
      whaleAddress: WHALE_POOLS["DAI"],
      useUnwrapped: true,
    },
    {
      contractName: "LusdPoolZap",
      swapAddress: "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA",
      gaugeAddress: "0x9B8519A9a00100720CCdC8a120fBeD319cA47a14",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["LUSD"],
    },
    {
      contractName: "MusdPoolZap",
      swapAddress: "0x8474DdbE98F5aA3179B3B3F5942D724aFcdec9f6",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x1AEf73d49Dedc4b1778d0706583995958Dc862e6",
      gaugeAddress: "0x5f626c30EC1215f4EdCc9982265E8b1F411D1352",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["MUSD"],
    },
    {
      contractName: "SAavePoolZap",
      swapAddress: "0xEB16Ae0052ed37f479f7fe63849198Df1765a733",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x02d341CcB60fAaf662bC0554d13778015d1b285C",
      gaugeAddress: "0x462253b8F74B72304c145DB0e4Eebd326B22ca39",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["ADAI"],
    },
    {
      contractName: "SusdV2Zap",
      swapAddress: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
      swapInterface: "IOldStableSwap4",
      lpTokenAddress: "0xC25a3A3b969415c80451098fa907EC722572917F",
      gaugeAddress: "0xA90996896660DEcC6E997655E065b23788857849",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["DAI"],
      rewardToken: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
    },
    {
      contractName: "UsdnPoolZap",
      swapAddress: "0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x4f3E8F405CF5aFC05D68142F3783bDfE13811522",
      gaugeAddress: "0xF98450B5602fa59CC66e1379DFfB6FDDc724CfC4",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["USDN"],
    },
    {
      contractName: "UsdpPoolZap",
      swapAddress: "0x42d7025938bEc20B69cBae5A77421082407f053A",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x7Eb40E450b9655f4B3cC4259BCC731c63ff55ae6",
      gaugeAddress: "0x055be5DDB7A925BfEF3417FC157f53CA77cA7222",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["USDP"],
    },
    {
      contractName: "UstPoolZap",
      swapAddress: "0x890f4e345B1dAED0367A877a1612f86A1f86985f",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x94e131324b6054c0D789b190b2dAC504e4361b53",
      gaugeAddress: "0x3B7020743Bc2A4ca9EaF9D0722d42E20d6935855",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["UST"],
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

  CurveConstants.forEach((curveConstant) => {
    const {
      contractName,
      swapAddress,
      swapInterface,
      lpTokenAddress,
      gaugeAddress,
      gaugeInterface,
      numberOfCoins,
      whaleAddress,
      rewardToken,
      useUnwrapped,
    } = curveConstant;

    describe(contractName, () => {
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
          "IDetailedERC20",
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
        let underlyerAddress;
        if (useUnwrapped) {
          underlyerAddress = await swap.underlying_coins(underlyerIndex);
        } else {
          underlyerAddress = await swap.coins(underlyerIndex);
        }

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

        const deployedZapUnderlyerBalance = await underlyerToken.balanceOf(
          zap.address
        );
        expect(deployedZapUnderlyerBalance).gt(0);
        const deployedZapLpBalance = await lpToken.balanceOf(zap.address);
        expect(deployedZapLpBalance).to.equal(0);
        const deployedGaugeLpBalance = await gauge.balanceOf(zap.address);
        expect(deployedGaugeLpBalance).gt(0);

        await zap.unwindLiquidity(deployedGaugeLpBalance, underlyerIndex);

        const withdrawnZapUnderlyerBalance = await underlyerToken.balanceOf(
          zap.address
        );
        expect(withdrawnZapUnderlyerBalance).gt(deployedZapUnderlyerBalance);
        const withdrawnZapLpBalance = await lpToken.balanceOf(zap.address);
        expect(withdrawnZapLpBalance).to.equal(0);
        const withdrawnGaugeLpBalance = await gauge.balanceOf(zap.address);
        expect(withdrawnGaugeLpBalance).to.equal(0);
      });

      it("Claim", async () => {
        const erc20s = await zap.erc20Allocations();

        expect(erc20s).to.include(ethers.utils.getAddress(CRV_ADDRESS));
        const crv = await ethers.getContractAt("IDetailedERC20", CRV_ADDRESS);
        expect(await crv.balanceOf(zap.address)).to.equal(0);

        if (typeof rewardToken !== "undefined") {
          expect(erc20s).to.include(ethers.utils.getAddress(rewardToken));
          const token = await ethers.getContractAt(
            "IDetailedERC20",
            rewardToken
          );
          expect(await token.balanceOf(zap.address)).to.equal(0);
        }

        const amounts = new Array(numberOfCoins).fill("0");
        const underlyerAmount = tokenAmountToBigNumber(
          100000,
          await underlyerToken.decimals()
        );
        amounts[underlyerIndex] = underlyerAmount;

        await zap.deployLiquidity(amounts);

        // allows rewards to accumulate:
        // CRV rewards accumulate within a block, but other rewards, like
        // staked Aave, require longer
        if (erc20s.length > 1) {
          const oneDayInSeconds = 60 * 60 * 24;
          await hre.network.provider.send("evm_increaseTime", [
            oneDayInSeconds,
          ]);
          await hre.network.provider.send("evm_mine");
        }

        await zap.claim();

        expect(await crv.balanceOf(zap.address)).to.be.gt(0);
        if (typeof rewardToken !== "undefined") {
          const token = await ethers.getContractAt(
            "IDetailedERC20",
            rewardToken
          );
          expect(await token.balanceOf(zap.address)).to.be.gt(0);
        }
      });
    });
  });
});
