const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  acquireToken,
  getStablecoinAddress,
  MAX_UINT256,
} = require("../utils/helpers");
const { STABLECOIN_POOLS } = require("../utils/constants");

const IDetailedERC20 = artifacts.readArtifactSync("IDetailedERC20");
const IStableSwap = artifacts.readArtifactSync("IStableSwap");
const IMetaPool = artifacts.readArtifactSync("IMetaPool");
const ILiquidityGauge = artifacts.readArtifactSync("ILiquidityGauge");

// 3Pool addresses:
const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const LP_TOKEN_ADDRESS_3CRV = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const LIQUIDITY_GAUGE_ADDRESS_3CRV =
  "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A";

const META_POOL_ADDRESS = "0x890f4e345B1dAED0367A877a1612f86A1f86985f";
//// sometimes a metapool is its own LP token; otherwise,
//// you can obtain from `token` attribute
const LP_TOKEN_ADDRESS = "0x94e131324b6054c0D789b190b2dAC504e4361b53";
const LIQUIDITY_GAUGE_ADDRESS = "0x3B7020743Bc2A4ca9EaF9D0722d42E20d6935855";

//// metapool primary underlyer
//address public constant UST_ADDRESS =
//    0xa47c8bf37f92aBed4A126BDA807A7b7498661acD;

describe("Contract: MetaPoolAllocationBase", () => {
  // signers
  let deployer;
  let lpSafe;

  // contract factories
  let MetaPoolAllocationBase;

  // deployed contracts
  let curve;

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
    [deployer, lpSafe] = await ethers.getSigners();
    const Curve3PoolAllocation = await ethers.getContractFactory(
      "Curve3PoolAllocation"
    );
    const curve3PoolAllocation = await Curve3PoolAllocation.deploy();
    MetaPoolAllocationBase = await ethers.getContractFactory(
      "MetaPoolAllocationBase"
    );
    curve = await MetaPoolAllocationBase.deploy(curve3PoolAllocation.address);
    await curve.deployed();
  });

  describe("getUnderlyerBalance", () => {
    let curve3Pool;
    let lpToken_3Crv;
    let gauge_3Crv;
    let metaPool;
    let lpToken;
    let gauge;

    const coinIndex = 0;
    const stablecoins = {};

    beforeEach(async () => {
      lpToken_3Crv = await ethers.getContractAt(
        IDetailedERC20.abi,
        LP_TOKEN_ADDRESS_3CRV
      );
      curve3Pool = await ethers.getContractAt(
        IStableSwap.abi,
        STABLE_SWAP_ADDRESS
      );
      gauge_3Crv = await ethers.getContractAt(
        ILiquidityGauge.abi,
        LIQUIDITY_GAUGE_ADDRESS_3CRV
      );

      metaPool = await ethers.getContractAt(IMetaPool.abi, META_POOL_ADDRESS);
      lpToken = await ethers.getContractAt(
        IDetailedERC20.abi,
        LP_TOKEN_ADDRESS
      );
      gauge = await ethers.getContractAt(
        ILiquidityGauge.abi,
        LIQUIDITY_GAUGE_ADDRESS
      );

      for (const symbol of ["DAI", "USDC", "USDT"]) {
        const stablecoinAddress = getStablecoinAddress(symbol, "MAINNET");
        stablecoins[symbol] = await ethers.getContractAt(
          "IDetailedERC20UpgradeSafe",
          stablecoinAddress
        );
      }

      for (const symbol of Object.keys(stablecoins)) {
        const token = stablecoins[symbol];
        const decimals = await token.decimals();
        const amount = tokenAmountToBigNumber("10000", decimals);
        const sender = STABLECOIN_POOLS[symbol];
        await acquireToken(sender, lpSafe, token, amount, deployer);
      }
    });

    it.only("Get underlyer balance from account holding", async () => {
      const daiAmount = tokenAmountToBigNumber("1000", 18);
      const daiIndex = 1;
      const minAmount = 0;
      await stablecoins["DAI"]
        .connect(lpSafe)
        .approve(curve3Pool.address, MAX_UINT256);
      await curve3Pool
        .connect(lpSafe)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      let lpBalance_3Crv = await lpToken_3Crv.balanceOf(lpSafe.address);
      console.log("3pool balance:", lpBalance_3Crv.toString());
      await lpToken_3Crv.connect(lpSafe).approve(metaPool.address, MAX_UINT256);
      await metaPool
        .connect(lpSafe)
        .add_liquidity(["0", lpBalance_3Crv], minAmount);

      const daiBalance_3Crv = await curve3Pool.balances(daiIndex - 1);
      const lpTotalSupply_3Crv = await lpToken_3Crv.totalSupply();

      const lpTotalSupply = await lpToken.totalSupply();
      const metaPool3CrvBalance = await metaPool.balances(1);
      const lpBalance = await lpToken.balanceOf(lpSafe.address);
      lpBalance_3Crv = lpBalance.mul(metaPool3CrvBalance).div(lpTotalSupply);

      const expectedBalance = lpBalance_3Crv
        .mul(daiBalance_3Crv)
        .div(lpTotalSupply_3Crv);
      expect(expectedBalance).to.be.gt(0);

      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        metaPool.address,
        gauge.address,
        lpToken.address,
        daiIndex
      );
      expect(balance).to.equal(expectedBalance);
    });

    it("Get underlyer balance from gauge holding", async () => {
      const daiAmount = tokenAmountToBigNumber("1000", 18);
      const daiIndex = 0;
      const minAmount = 0;
      await stablecoins["DAI"]
        .connect(lpSafe)
        .approve(curve3Pool.address, MAX_UINT256);
      await curve3Pool
        .connect(lpSafe)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      await lpToken_3Crv
        .connect(lpSafe)
        .approve(gauge_3Crv.address, MAX_UINT256);
      const strategyLpBalance = await lpToken_3Crv.balanceOf(lpSafe.address);
      await gauge_3Crv.connect(lpSafe)["deposit(uint256)"](strategyLpBalance);
      expect(await lpToken_3Crv.balanceOf(lpSafe.address)).to.equal(0);
      const gaugeLpBalance = await gauge_3Crv.balanceOf(lpSafe.address);
      expect(gaugeLpBalance).to.be.gt(0);

      const poolBalance = await curve3Pool.balances(daiIndex);
      const lpTotalSupply = await lpToken_3Crv.totalSupply();

      const expectedBalance = gaugeLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        curve3Pool.address,
        gauge_3Crv.address,
        lpToken_3Crv.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });

    it("Get underlyer balance from combined holdings", async () => {
      const daiAmount = tokenAmountToBigNumber("1000", 18);
      const daiIndex = 0;
      const minAmount = 0;
      await stablecoins["DAI"]
        .connect(lpSafe)
        .approve(curve3Pool.address, MAX_UINT256);
      await curve3Pool
        .connect(lpSafe)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      // split LP tokens between strategy and gauge
      const totalLPBalance = await lpToken_3Crv.balanceOf(lpSafe.address);
      const strategyLpBalance = totalLPBalance.div(3);
      const gaugeLpBalance = totalLPBalance.sub(strategyLpBalance);
      expect(gaugeLpBalance).to.be.gt(0);
      expect(strategyLpBalance).to.be.gt(0);

      await lpToken_3Crv
        .connect(lpSafe)
        .approve(gauge_3Crv.address, MAX_UINT256);
      await gauge_3Crv.connect(lpSafe)["deposit(uint256)"](gaugeLpBalance);

      expect(await lpToken_3Crv.balanceOf(lpSafe.address)).to.equal(
        strategyLpBalance
      );
      expect(await gauge_3Crv.balanceOf(lpSafe.address)).to.equal(
        gaugeLpBalance
      );

      const poolBalance = await curve3Pool.balances(daiIndex);
      const lpTotalSupply = await lpToken_3Crv.totalSupply();

      const expectedBalance = totalLPBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      const balance = await curve.getUnderlyerBalance(
        lpSafe.address,
        curve3Pool.address,
        gauge_3Crv.address,
        lpToken_3Crv.address,
        coinIndex
      );
      expect(balance).to.equal(expectedBalance);
    });
  });
});
