const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  getStablecoinAddress,
  acquireToken,
  MAX_UINT256,
  bytes32,
} = require("../utils/helpers");
const { STABLECOIN_POOLS } = require("../utils/constants");

const dai = (amount) => tokenAmountToBigNumber(amount, "18");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe.only("Contract: TvlManager", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let lpSafe;
  let poolManager;

  /* contract factories */
  let TvlManager;

  /* deployed contracts */
  let tvlManager;

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
    [deployer, emergencySafe, lpSafe, poolManager] = await ethers.getSigners();

    const addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    /* These registered addresses are setup for roles in the
     * constructor for TvlManager
     * TvlManager
     * - poolManager (contract role)
     * - lpSafe (LP role)
     * - emergencySafe (emergency role, default admin role)
     */
    await addressRegistry.mock.poolManagerAddress.returns(poolManager.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.require("IOracleAdapter").abi
    );
    await oracleAdapter.mock.lock.returns();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    /* These registered addresses are setup for roles in the
     * constructor for Erc20Allocation:
     * - poolManager (contract role)
     * - lpSafe (contract role)
     * - emergencySafe (default admin role)
     */
    const Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    const erc20Allocation = await Erc20Allocation.deploy(
      addressRegistry.address
    );

    TvlManager = await ethers.getContractFactory("TvlManager");
    tvlManager = await TvlManager.deploy(
      addressRegistry.address,
      erc20Allocation.address
    );
  });

  describe("Curve 3Pool allocation", () => {
    let Curve3PoolAllocation;
    let curve;

    // Curve 3Pool
    let lpToken;
    let stableSwap;
    let gauge;
    let daiToken;
    let lookupId;

    const daiIndex = 0;

    // Curve 3Pool Mainnet addresses:
    const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
    const LP_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
    const LIQUIDITY_GAUGE_ADDRESS =
      "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A";

    before("Deploy and attach to contracts", async () => {
      Curve3PoolAllocation = await ethers.getContractFactory(
        "Curve3PoolAllocation"
      );
      curve = await Curve3PoolAllocation.deploy();
      await curve.deployed();

      lpToken = await ethers.getContractAt(
        "IDetailedERC20UpgradeSafe",
        LP_TOKEN_ADDRESS
      );
      stableSwap = await ethers.getContractAt(
        "IStableSwap",
        STABLE_SWAP_ADDRESS
      );
      gauge = await ethers.getContractAt(
        "ILiquidityGauge",
        LIQUIDITY_GAUGE_ADDRESS
      );
    });

    before("Prepare account 0 with DAI funds", async () => {
      const daiAddress = getStablecoinAddress("DAI", "MAINNET");
      daiToken = await ethers.getContractAt(
        "IDetailedERC20UpgradeSafe",
        daiAddress
      );

      const amount = dai(500000);
      const sender = STABLECOIN_POOLS["DAI"];
      await acquireToken(sender, lpSafe, daiToken, amount, deployer);
    });

    before("Register asset allocation", async () => {
      await tvlManager.connect(lpSafe).registerAssetAllocation(curve.address);
      lookupId = await tvlManager.getAssetAllocationId(curve.address, 0);
    });

    it("Get underlyer balance from account holding", async () => {
      const daiAmount = dai("1000");
      const minAmount = 0;
      await daiToken.connect(lpSafe).approve(stableSwap.address, MAX_UINT256);
      await stableSwap
        .connect(lpSafe)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      const strategyLpBalance = await lpToken.balanceOf(lpSafe.address);
      const poolBalance = await stableSwap.balances(daiIndex);
      const lpTotalSupply = await lpToken.totalSupply();

      const expectedBalance = strategyLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      expect(await tvlManager.balanceOf(lookupId)).to.equal(expectedBalance);
    });

    it("Get underlyer balance from gauge holding", async () => {
      const daiAmount = dai("1000");
      const minAmount = 0;
      await daiToken.connect(lpSafe).approve(stableSwap.address, MAX_UINT256);
      await stableSwap
        .connect(lpSafe)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
      const strategyLpBalance = await lpToken.balanceOf(lpSafe.address);
      await gauge.connect(lpSafe)["deposit(uint256)"](strategyLpBalance);
      expect(await lpToken.balanceOf(lpSafe.address)).to.equal(0);
      const gaugeLpBalance = await gauge.balanceOf(lpSafe.address);
      expect(gaugeLpBalance).to.be.gt(0);

      const poolBalance = await stableSwap.balances(daiIndex);
      const lpTotalSupply = await lpToken.totalSupply();

      const expectedBalance = gaugeLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      expect(await tvlManager.balanceOf(lookupId)).to.equal(expectedBalance);
    });

    it("Get underlyer balance from combined holdings", async () => {
      const daiAmount = dai("1000");
      const minAmount = 0;
      await daiToken.connect(lpSafe).approve(stableSwap.address, MAX_UINT256);
      await stableSwap
        .connect(lpSafe)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      // split LP tokens between strategy and gauge
      const totalLPBalance = await lpToken.balanceOf(lpSafe.address);
      const strategyLpBalance = totalLPBalance.div(3);
      const gaugeLpBalance = totalLPBalance.sub(strategyLpBalance);
      expect(gaugeLpBalance).to.be.gt(0);
      expect(strategyLpBalance).to.be.gt(0);

      await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
      await gauge.connect(lpSafe)["deposit(uint256)"](gaugeLpBalance);

      expect(await lpToken.balanceOf(lpSafe.address)).to.equal(
        strategyLpBalance
      );
      expect(await gauge.balanceOf(lpSafe.address)).to.equal(gaugeLpBalance);

      const poolBalance = await stableSwap.balances(daiIndex);
      const lpTotalSupply = await lpToken.totalSupply();

      const expectedBalance = totalLPBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      expect(await tvlManager.balanceOf(lookupId)).to.equal(expectedBalance);
    });
  });

  const CurveMetaPoolAllocation = [
    {
      contractName: "CurveUstAllocation",
      primaryUnderlyerSymbol: "UST",
      whaleAddress: "0x87dA823B6fC8EB8575a235A824690fda94674c88",
    },
    // {
    //   contractName: "CurveAlUsdAllocation",
    //   primaryUnderlyerSymbol: "alUSD",
    //   whaleAddress: undefined, // TODO
    // },
  ];

  CurveMetaPoolAllocation.forEach(function (allocationData) {
    const {
      contractName,
      primaryUnderlyerSymbol,
      whaleAddress,
    } = allocationData;

    describe(`Curve ${primaryUnderlyerSymbol} allocation`, () => {
      let allocation;
      let curve3PoolAllocation;

      // MetaPool
      let lpToken;
      let metaPool;
      let gauge;
      // Curve 3Pool;
      let baseLpToken;
      let basePool;

      let primaryToken;
      let primaryAllocationId;
      const primaryIndex = 0;

      let daiToken;
      let daiAllocationId;
      const daiIndex = 1;

      before("Deploy allocation contracts", async () => {
        const Curve3PoolAllocation = await ethers.getContractFactory(
          "Curve3PoolAllocation"
        );
        curve3PoolAllocation = await Curve3PoolAllocation.deploy();
        const CurveAllocation = await ethers.getContractFactory(contractName);
        allocation = await CurveAllocation.deploy(curve3PoolAllocation.address);
      });

      // need to reset these for each pool
      before("Attach to Mainnet contracts", async () => {
        // Metapool addresses
        const META_POOL_ADDRESS = await allocation.META_POOL_ADDRESS();
        const LP_TOKEN_ADDRESS = await allocation.LP_TOKEN_ADDRESS();
        const LIQUIDITY_GAUGE_ADDRESS = await allocation.LIQUIDITY_GAUGE_ADDRESS();

        metaPool = await ethers.getContractAt("IMetaPool", META_POOL_ADDRESS);
        lpToken = await ethers.getContractAt(
          "IDetailedERC20",
          LP_TOKEN_ADDRESS
        );
        gauge = await ethers.getContractAt(
          "ILiquidityGauge",
          LIQUIDITY_GAUGE_ADDRESS
        );

        // 3Pool addresses:
        const BASE_POOL_ADDRESS = await curve3PoolAllocation.STABLE_SWAP_ADDRESS();
        const BASE_LP_TOKEN_ADDRESS = await curve3PoolAllocation.LP_TOKEN_ADDRESS();

        basePool = await ethers.getContractAt("IStableSwap", BASE_POOL_ADDRESS);
        baseLpToken = await ethers.getContractAt(
          "IDetailedERC20",
          BASE_LP_TOKEN_ADDRESS
        );
      });

      before(
        `Prepare account 0 with DAI and ${primaryUnderlyerSymbol} funds`,
        async () => {
          const daiAddress = getStablecoinAddress("DAI", "MAINNET");
          daiToken = await ethers.getContractAt(
            "IDetailedERC20UpgradeSafe",
            daiAddress
          );
          let amount = tokenAmountToBigNumber(
            500000,
            await daiToken.decimals()
          );
          let sender = STABLECOIN_POOLS["DAI"];
          await acquireToken(sender, lpSafe, daiToken, amount, deployer);

          const PRIMARY_UNDERLYER_ADDRESS = await allocation.PRIMARY_UNDERLYER_ADDRESS();
          primaryToken = await ethers.getContractAt(
            "IDetailedERC20UpgradeSafe",
            PRIMARY_UNDERLYER_ADDRESS
          );
          amount = tokenAmountToBigNumber(
            500000,
            await primaryToken.decimals()
          );
          sender = whaleAddress;
          await acquireToken(sender, lpSafe, primaryToken, amount, deployer);
        }
      );

      before("Register asset allocation", async () => {
        await tvlManager
          .connect(lpSafe)
          .registerAssetAllocation(allocation.address);
        primaryAllocationId = await tvlManager.getAssetAllocationId(
          allocation.address,
          primaryIndex
        );
        daiAllocationId = await tvlManager.getAssetAllocationId(
          allocation.address,
          daiIndex
        );
      });

      it("Get 3Pool underlyer balance from account holding", async () => {
        const daiAmount = tokenAmountToBigNumber("1000", 18);
        const minAmount = 0;

        // deposit into 3Pool
        await daiToken.connect(lpSafe).approve(basePool.address, MAX_UINT256);
        await basePool
          .connect(lpSafe)
          .add_liquidity([daiAmount, "0", "0"], minAmount);

        // deposit 3Crv into metapool
        let baseLpBalance = await baseLpToken.balanceOf(lpSafe.address);
        await baseLpToken
          .connect(lpSafe)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool
          .connect(lpSafe)
          .add_liquidity(["0", baseLpBalance], minAmount);

        const basePoolDaiBalance = await basePool.balances(daiIndex - 1);
        const basePoolLpTotalSupply = await baseLpToken.totalSupply();

        // update LP Safe's base pool LP balance after depositing
        // into the metapool, which will swap for some primary underlyer
        const metaPoolBaseLpBalance = await metaPool.balances(1);
        const lpBalance = await lpToken.balanceOf(lpSafe.address);
        const lpTotalSupply = await lpToken.totalSupply();
        baseLpBalance = lpBalance.mul(metaPoolBaseLpBalance).div(lpTotalSupply);

        const expectedBalance = baseLpBalance
          .mul(basePoolDaiBalance)
          .div(basePoolLpTotalSupply);
        expect(expectedBalance).to.be.gt(0);

        const balance = await tvlManager.balanceOf(daiAllocationId);
        expect(balance).to.equal(expectedBalance);
      });

      it("Get 3Pool underlyer balance from gauge holding", async () => {
        const daiAmount = tokenAmountToBigNumber("1000", 18);
        const minAmount = 0;

        // deposit into 3Pool
        await daiToken.connect(lpSafe).approve(basePool.address, MAX_UINT256);
        await basePool
          .connect(lpSafe)
          .add_liquidity([daiAmount, "0", "0"], minAmount);

        // deposit 3Crv into metapool
        let baseLpBalance = await baseLpToken.balanceOf(lpSafe.address);
        await baseLpToken
          .connect(lpSafe)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool
          .connect(lpSafe)
          .add_liquidity(["0", baseLpBalance], minAmount);

        await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
        const lpBalance = await lpToken.balanceOf(lpSafe.address);
        await gauge.connect(lpSafe)["deposit(uint256)"](lpBalance);
        expect(await lpToken.balanceOf(lpSafe.address)).to.equal(0);
        const gaugeLpBalance = await gauge.balanceOf(lpSafe.address);
        expect(gaugeLpBalance).to.equal(lpBalance);

        const basePoolDaiBalance = await basePool.balances(daiIndex - 1);
        const basePoolLpTotalSupply = await baseLpToken.totalSupply();

        // update LP Safe's base pool LP balance after depositing
        // into the metapool, which will swap for some primary underlyer
        const metaPoolBaseLpBalance = await metaPool.balances(1);
        const lpTotalSupply = await lpToken.totalSupply();
        baseLpBalance = gaugeLpBalance
          .mul(metaPoolBaseLpBalance)
          .div(lpTotalSupply);

        const expectedBalance = baseLpBalance
          .mul(basePoolDaiBalance)
          .div(basePoolLpTotalSupply);
        expect(expectedBalance).to.be.gt(0);

        const balance = await tvlManager.balanceOf(daiAllocationId);
        expect(balance).to.equal(expectedBalance);
      });

      it("Get 3Pool underlyer balance from combined holdings", async () => {
        const daiAmount = tokenAmountToBigNumber("1000", 18);
        const minAmount = 0;

        // deposit into 3Pool
        await daiToken.connect(lpSafe).approve(basePool.address, MAX_UINT256);
        await basePool
          .connect(lpSafe)
          .add_liquidity([daiAmount, "0", "0"], minAmount);

        // deposit 3Crv into metapool
        let baseLpBalance = await baseLpToken.balanceOf(lpSafe.address);
        await baseLpToken
          .connect(lpSafe)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool
          .connect(lpSafe)
          .add_liquidity(["0", baseLpBalance], minAmount);

        // split LP tokens between strategy and gauge
        const totalLpBalance = await lpToken.balanceOf(lpSafe.address);
        const strategyLpBalance = totalLpBalance.div(3);
        const gaugeLpBalance = totalLpBalance.sub(strategyLpBalance);
        expect(gaugeLpBalance).to.be.gt(0);
        expect(strategyLpBalance).to.be.gt(0);

        // update LP Safe's base pool LP balance after depositing
        // into the metapool, which will swap for some primary underlyer
        const metaPoolBaseLpBalance = await metaPool.balances(1);
        const lpTotalSupply = await lpToken.totalSupply();
        baseLpBalance = totalLpBalance
          .mul(metaPoolBaseLpBalance)
          .div(lpTotalSupply);

        await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
        await gauge.connect(lpSafe)["deposit(uint256)"](gaugeLpBalance);

        expect(await lpToken.balanceOf(lpSafe.address)).to.equal(
          strategyLpBalance
        );
        expect(await gauge.balanceOf(lpSafe.address)).to.equal(gaugeLpBalance);

        const basePoolDaiBalance = await basePool.balances(daiIndex - 1);
        const basePoolLpTotalSupply = await baseLpToken.totalSupply();

        const expectedBalance = baseLpBalance
          .mul(basePoolDaiBalance)
          .div(basePoolLpTotalSupply);
        expect(expectedBalance).to.be.gt(0);

        const balance = await tvlManager.balanceOf(daiAllocationId);
        expect(balance).to.equal(expectedBalance);
      });

      it("Get UST balance from account holding", async () => {
        const ustAmount = tokenAmountToBigNumber("1000", 18);
        const ustIndex = 0;
        const minAmount = 0;

        // deposit UST into metapool
        await primaryToken
          .connect(lpSafe)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool
          .connect(lpSafe)
          .add_liquidity([ustAmount, "0"], minAmount);

        const metaPoolUstBalance = await metaPool.balances(ustIndex);
        const lpBalance = await lpToken.balanceOf(lpSafe.address);
        const lpTotalSupply = await lpToken.totalSupply();
        const expectedBalance = lpBalance
          .mul(metaPoolUstBalance)
          .div(lpTotalSupply);

        const balance = await tvlManager.balanceOf(primaryAllocationId);
        expect(balance).to.equal(expectedBalance);
      });

      it("Get UST balance from gauge holding", async () => {
        const ustAmount = tokenAmountToBigNumber("1000", 18);
        const ustIndex = 0;
        const minAmount = 0;

        // deposit UST into metapool
        await primaryToken
          .connect(lpSafe)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool
          .connect(lpSafe)
          .add_liquidity([ustAmount, "0"], minAmount);

        const metaPoolUstBalance = await metaPool.balances(ustIndex);

        await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
        const lpBalance = await lpToken.balanceOf(lpSafe.address);
        await gauge.connect(lpSafe)["deposit(uint256)"](lpBalance);
        expect(await lpToken.balanceOf(lpSafe.address)).to.equal(0);
        const gaugeLpBalance = await gauge.balanceOf(lpSafe.address);
        expect(gaugeLpBalance).to.equal(lpBalance);

        const lpTotalSupply = await lpToken.totalSupply();
        const expectedBalance = gaugeLpBalance
          .mul(metaPoolUstBalance)
          .div(lpTotalSupply);

        const balance = await tvlManager.balanceOf(primaryAllocationId);
        expect(balance).to.equal(expectedBalance);
      });

      it("Get UST balance from combined holdings", async () => {
        const ustAmount = tokenAmountToBigNumber("1000", 18);
        const ustIndex = 0;
        const minAmount = 0;

        // deposit UST into metapool
        await primaryToken
          .connect(lpSafe)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool
          .connect(lpSafe)
          .add_liquidity([ustAmount, "0"], minAmount);

        // split LP tokens between strategy and gauge
        const totalLpBalance = await lpToken.balanceOf(lpSafe.address);
        const strategyLpBalance = totalLpBalance.div(3);
        const gaugeLpBalance = totalLpBalance.sub(strategyLpBalance);
        expect(gaugeLpBalance).to.be.gt(0);
        expect(strategyLpBalance).to.be.gt(0);

        await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
        await gauge.connect(lpSafe)["deposit(uint256)"](gaugeLpBalance);

        expect(await lpToken.balanceOf(lpSafe.address)).to.equal(
          strategyLpBalance
        );
        expect(await gauge.balanceOf(lpSafe.address)).to.equal(gaugeLpBalance);

        const metaPoolUstBalance = await metaPool.balances(ustIndex);
        const lpTotalSupply = await lpToken.totalSupply();

        const expectedBalance = totalLpBalance
          .mul(metaPoolUstBalance)
          .div(lpTotalSupply);

        const balance = await tvlManager.balanceOf(primaryAllocationId);
        expect(balance).to.equal(expectedBalance);
      });
    });
  });
});
