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
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

const CurvePoolAllocations = [
  {
    contractName: "Curve3PoolAllocation",
    poolName: "3Pool",
    // Curve sUSDv2 pool, holds DAI
    whaleAddress: WHALE_POOLS["DAI"],
    numberOfCoins: 3,
    interfaceOverride: {
      IStableSwap: "IStableSwap3",
    },
  },
  {
    contractName: "CurveIronBankAllocation",
    poolName: "IronBank",
    // ibDAIv2, holds cyDAI
    whaleAddress: "0xee8389d235E092b2945fE363e97CDBeD121A0439",
    numberOfCoins: 3,
    interfaceOverride: {
      IStableSwap: "IStableSwap3",
    },
    unwrap: true,
  },
  {
    contractName: "CurveSaaveAllocation",
    poolName: "sAAVE",
    // Aave whale, holds aDAI
    whaleAddress: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
    numberOfCoins: 2,
    interfaceOverride: {
      IStableSwap: "IStableSwap2",
    },
  },
  {
    contractName: "CurveAaveAllocation",
    poolName: "AAVE",
    // mStable: mUSD Aave integration, holds aDAI
    whaleAddress: "0xA2a3CAe63476891AB2d640d9a5A800755Ee79d6E",
    numberOfCoins: 3,
    interfaceOverride: {
      IStableSwap: "IStableSwap3",
    },
  },
  {
    contractName: "CurveSusdV2Allocation",
    poolName: "sUSDv2",
    // 3Pool, holds DAI
    whaleAddress: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    numberOfCoins: 4,
    interfaceOverride: {
      IStableSwap: "IOldStableSwap4",
    },
  },
  {
    contractName: "CurveCompoundAllocation",
    poolName: "Compound",
    // Compound whale, holds cDAI
    whaleAddress: "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296",
    numberOfCoins: 2,
    interfaceOverride: {
      IStableSwap: "IOldStableSwap2",
    },
    unwrap: true,
  },
];

const CurveMetaPoolAllocations = [
  {
    contractName: "CurveUstAllocation",
    primaryUnderlyerSymbol: "UST",
    whaleAddress: "0x87dA823B6fC8EB8575a235A824690fda94674c88",
  },
  {
    contractName: "CurveAlusdAllocation",
    primaryUnderlyerSymbol: "alUSD",
    whaleAddress: "0xAB8e74017a8Cc7c15FFcCd726603790d26d7DeCa",
  },
  {
    contractName: "CurveUsdnAllocation",
    primaryUnderlyerSymbol: "USDN",
    // using the Curve pool itself as the "whale":
    // should be ok since the pool's external balances (vs the pool's
    // internal balances) are only used for admin balances and determining
    // deposit amounts for "fee" assets.  For this metapool, only
    // Tether is a fee asset.
    whaleAddress: "0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1",
  },
  {
    contractName: "CurveUsdpAllocation",
    primaryUnderlyerSymbol: "USDP",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0x42d7025938bec20b69cbae5a77421082407f053a",
  },
  {
    contractName: "CurveMusdAllocation",
    primaryUnderlyerSymbol: "mUSD",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0x8474DdbE98F5aA3179B3B3F5942D724aFcdec9f6",
  },
  {
    contractName: "CurveFraxAllocation",
    primaryUnderlyerSymbol: "FRAX",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
  },
  {
    contractName: "CurveBusdV2Allocation",
    primaryUnderlyerSymbol: "BUSD",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
  },
  {
    contractName: "CurveLusdAllocation",
    primaryUnderlyerSymbol: "LUSD",
    // using the Curve pool itself as the "whale": see prior note
    whaleAddress: "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA",
  },
];

async function getContractAt(
  interfaceName,
  contractAddress,
  interfaceOverride,
  signer
) {
  const override =
    interfaceOverride && interfaceOverride[interfaceName]
      ? interfaceOverride[interfaceName]
      : interfaceName;
  if (typeof override === "string") {
    interfaceName = override;
  } else if (typeof override === "object") {
    interfaceName = override.name;
  } else {
    throw Error("Unrecognized type for interface override.");
  }

  let contract = await ethers.getContractAt(interfaceName, contractAddress);
  if (signer) {
    contract = contract.connect(signer);
  }
  for (const [originalSig, overrideSig] of Object.entries(
    override.functions || {}
  )) {
    contract[originalSig] = contract[overrideSig];
  }
  return contract;
}

describe("Allocations", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let adminSafe;
  let lpAccount;
  let mApt;

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
    [
      deployer,
      emergencySafe,
      adminSafe,
      mApt,
      lpAccount,
    ] = await ethers.getSigners();

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
     * - adminSafe (admin role)
     * - mApt (contract role)
     */
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.mAptAddress.returns(mApt.address);
    await addressRegistry.mock.lpAccountAddress.returns(lpAccount.address);

    /* These registered addresses are setup for roles in the
     * constructor for TvlManager
     * - emergencySafe (emergency role, default admin role)
     * - adminSafe (admin role)
     */
    TvlManager = await ethers.getContractFactory("TestTvlManager");
    tvlManager = await TvlManager.deploy(addressRegistry.address);
  });

  describe("Aave stablecoin allocation", () => {
    let allocation;

    let lendingPool;

    let underlyerToken;
    const underlyerIndex = 0;
    let lookupId;

    before("Deploy allocation contract", async () => {
      const AaveStableCoinAllocation = await ethers.getContractFactory(
        "AaveStableCoinAllocation"
      );
      allocation = await AaveStableCoinAllocation.deploy();
      await allocation.deployed();
    });

    before("Attach to Mainnet Aave contracts", async () => {
      const LENDING_POOL_ADDRESS = await allocation.LENDING_POOL_ADDRESS();
      lendingPool = await ethers.getContractAt(
        "ILendingPool",
        LENDING_POOL_ADDRESS,
        lpAccount
      );
    });

    before("Fund account 0 with pool underlyer", async () => {
      const tokens = await allocation.tokens();
      const underlyerAddress = tokens[underlyerIndex].token;
      underlyerToken = await ethers.getContractAt(
        "IDetailedERC20",
        underlyerAddress
      );

      const amount = tokenAmountToBigNumber(
        100000,
        await underlyerToken.decimals()
      );
      const sender = WHALE_POOLS["DAI"];
      await acquireToken(sender, lpAccount, underlyerToken, amount, deployer);
    });

    before("Register asset allocation", async () => {
      await tvlManager
        .connect(adminSafe)
        .registerAssetAllocation(allocation.address);
      lookupId = await tvlManager.testEncodeAssetAllocationId(
        allocation.address,
        underlyerIndex
      );
    });

    it("Get underlyer balance from account holding", async () => {
      const underlyerAmount = tokenAmountToBigNumber(
        1000,
        await underlyerToken.decimals()
      );

      await underlyerToken
        .connect(lpAccount)
        .approve(lendingPool.address, MAX_UINT256);
      await lendingPool.deposit(
        underlyerToken.address,
        underlyerAmount,
        lpAccount.address,
        0
      );

      const balance = await tvlManager.balanceOf(lookupId);
      // allow a few wei deviation
      expect(balance.sub(underlyerAmount).abs()).to.be.lt(3);
    });
  });

  CurvePoolAllocations.forEach(function (allocationData) {
    const {
      contractName,
      poolName,
      whaleAddress,
      numberOfCoins,
      unwrap,
      interfaceOverride,
    } = allocationData;

    describe(`Curve ${poolName} allocation`, () => {
      let allocation;

      let lpToken;
      let stableSwap;
      let gauge;

      let underlyerToken;
      const underlyerIndex = 0;
      let lookupId;

      before("Deploy allocation contract", async () => {
        const CurvePoolAllocation = await ethers.getContractFactory(
          contractName
        );
        allocation = await CurvePoolAllocation.deploy();
        await allocation.deployed();
      });

      before("Attach to Mainnet Curve contracts", async () => {
        const STABLE_SWAP_ADDRESS = await allocation.STABLE_SWAP_ADDRESS();
        stableSwap = await getContractAt(
          "IStableSwap",
          STABLE_SWAP_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const LP_TOKEN_ADDRESS = await allocation.LP_TOKEN_ADDRESS();
        lpToken = await getContractAt(
          "IDetailedERC20",
          LP_TOKEN_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const LIQUIDITY_GAUGE_ADDRESS = await allocation.LIQUIDITY_GAUGE_ADDRESS();
        gauge = await getContractAt(
          "ILiquidityGauge",
          LIQUIDITY_GAUGE_ADDRESS,
          interfaceOverride,
          lpAccount
        );
      });

      before("Fund account 0 with pool underlyer", async () => {
        const underlyerAddress = await stableSwap.coins(underlyerIndex);
        underlyerToken = await ethers.getContractAt(
          "IDetailedERC20",
          underlyerAddress
        );

        const amount = tokenAmountToBigNumber(
          100000,
          await underlyerToken.decimals()
        );
        const sender = whaleAddress;
        await acquireToken(sender, lpAccount, underlyerToken, amount, deployer);
      });

      before("Register asset allocation", async () => {
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(allocation.address);
        lookupId = await tvlManager.testEncodeAssetAllocationId(
          allocation.address,
          underlyerIndex
        );
      });

      it("Get underlyer balance from account holding", async () => {
        const minAmount = 0;
        const amounts = new Array(numberOfCoins).fill("0");
        const underlyerAmount = tokenAmountToBigNumber(
          1000,
          await underlyerToken.decimals()
        );
        amounts[underlyerIndex] = underlyerAmount;

        await underlyerToken
          .connect(lpAccount)
          .approve(stableSwap.address, MAX_UINT256);
        await stableSwap[`add_liquidity(uint256[${numberOfCoins}],uint256)`](
          amounts,
          minAmount
        );

        const strategyLpBalance = await lpToken.balanceOf(lpAccount.address);
        const poolBalance = await stableSwap.balances(underlyerIndex);
        const lpTotalSupply = await lpToken.totalSupply();

        let expectedBalance = strategyLpBalance
          .mul(poolBalance)
          .div(lpTotalSupply);
        if (unwrap) {
          expectedBalance = await allocation.unwrapBalance(
            expectedBalance,
            underlyerIndex
          );
        }
        expect(expectedBalance).to.be.gt(0);

        const balance = await tvlManager.balanceOf(lookupId);
        // allow a few wei deviation
        expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
      });

      it("Get underlyer balance from gauge holding", async () => {
        const minAmount = 0;
        const amounts = new Array(numberOfCoins).fill("0");
        const underlyerAmount = tokenAmountToBigNumber(
          1000,
          await underlyerToken.decimals()
        );
        amounts[underlyerIndex] = underlyerAmount;

        await underlyerToken
          .connect(lpAccount)
          .approve(stableSwap.address, MAX_UINT256);
        await stableSwap[`add_liquidity(uint256[${numberOfCoins}],uint256)`](
          amounts,
          minAmount
        );

        await lpToken.connect(lpAccount).approve(gauge.address, MAX_UINT256);
        const strategyLpBalance = await lpToken.balanceOf(lpAccount.address);
        await gauge["deposit(uint256)"](strategyLpBalance);
        expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
        const gaugeLpBalance = await gauge.balanceOf(lpAccount.address);
        expect(gaugeLpBalance).to.be.gt(0);

        const poolBalance = await stableSwap.balances(underlyerIndex);
        const lpTotalSupply = await lpToken.totalSupply();

        let expectedBalance = gaugeLpBalance
          .mul(poolBalance)
          .div(lpTotalSupply);
        if (unwrap) {
          expectedBalance = await allocation.unwrapBalance(
            expectedBalance,
            underlyerIndex
          );
        }
        expect(expectedBalance).to.be.gt(0);

        const balance = await tvlManager.balanceOf(lookupId);
        // allow a few wei deviation
        expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
      });

      it("Get underlyer balance from combined holdings", async () => {
        const minAmount = 0;
        const amounts = new Array(numberOfCoins).fill("0");
        const underlyerAmount = tokenAmountToBigNumber(
          1000,
          await underlyerToken.decimals()
        );
        amounts[underlyerIndex] = underlyerAmount;

        await underlyerToken
          .connect(lpAccount)
          .approve(stableSwap.address, MAX_UINT256);
        await stableSwap[`add_liquidity(uint256[${numberOfCoins}],uint256)`](
          amounts,
          minAmount
        );

        // split LP tokens between strategy and gauge
        const totalLpBalance = await lpToken.balanceOf(lpAccount.address);
        const strategyLpBalance = totalLpBalance.div(3);
        const gaugeLpBalance = totalLpBalance.sub(strategyLpBalance);
        expect(gaugeLpBalance).to.be.gt(0);
        expect(strategyLpBalance).to.be.gt(0);

        await lpToken.connect(lpAccount).approve(gauge.address, MAX_UINT256);
        await gauge["deposit(uint256)"](gaugeLpBalance);

        expect(await lpToken.balanceOf(lpAccount.address)).to.equal(
          strategyLpBalance
        );
        expect(await gauge.balanceOf(lpAccount.address)).to.equal(
          gaugeLpBalance
        );

        const poolBalance = await stableSwap.balances(underlyerIndex);
        const lpTotalSupply = await lpToken.totalSupply();

        let expectedBalance = totalLpBalance
          .mul(poolBalance)
          .div(lpTotalSupply);
        if (unwrap) {
          expectedBalance = await allocation.unwrapBalance(
            expectedBalance,
            underlyerIndex
          );
        }
        expect(expectedBalance).to.be.gt(0);

        const balance = await tvlManager.balanceOf(lookupId);
        // allow a few wei deviation
        expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
      });
    });
  });

  CurveMetaPoolAllocations.forEach(function (allocationData) {
    const {
      contractName,
      primaryUnderlyerSymbol,
      whaleAddress,
      interfaceOverride,
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
        // Metapool
        const META_POOL_ADDRESS = await allocation.META_POOL();
        metaPool = await getContractAt(
          "IMetaPool",
          META_POOL_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const LP_TOKEN_ADDRESS = await allocation.LP_TOKEN();
        lpToken = await getContractAt(
          "IDetailedERC20",
          LP_TOKEN_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const LIQUIDITY_GAUGE_ADDRESS = await allocation.LIQUIDITY_GAUGE();
        gauge = await getContractAt(
          "ILiquidityGauge",
          LIQUIDITY_GAUGE_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        // 3Pool
        const BASE_POOL_ADDRESS = await curve3PoolAllocation.STABLE_SWAP_ADDRESS();
        basePool = await getContractAt(
          "IStableSwap",
          BASE_POOL_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const BASE_LP_TOKEN_ADDRESS = await curve3PoolAllocation.LP_TOKEN_ADDRESS();
        baseLpToken = await getContractAt(
          "IDetailedERC20",
          BASE_LP_TOKEN_ADDRESS,
          interfaceOverride,
          lpAccount
        );
      });

      before(
        `Prepare account 0 with DAI and ${primaryUnderlyerSymbol} funds`,
        async () => {
          const daiAddress = getStablecoinAddress("DAI", "MAINNET");
          daiToken = await ethers.getContractAt("IDetailedERC20", daiAddress);
          let amount = tokenAmountToBigNumber(
            100000,
            await daiToken.decimals()
          );
          let sender = WHALE_POOLS["DAI"];
          await acquireToken(sender, lpAccount, daiToken, amount, deployer);

          const PRIMARY_UNDERLYER_ADDRESS = await allocation.PRIMARY_UNDERLYER();
          primaryToken = await ethers.getContractAt(
            "IDetailedERC20",
            PRIMARY_UNDERLYER_ADDRESS
          );
          amount = tokenAmountToBigNumber(
            100000,
            await primaryToken.decimals()
          );
          sender = whaleAddress;
          await acquireToken(sender, lpAccount, primaryToken, amount, deployer);
        }
      );

      before("Register asset allocation", async () => {
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(allocation.address);
        primaryAllocationId = await tvlManager.testEncodeAssetAllocationId(
          allocation.address,
          primaryIndex
        );
        daiAllocationId = await tvlManager.testEncodeAssetAllocationId(
          allocation.address,
          daiIndex
        );
      });

      it("Get 3Pool underlyer balance from account holding", async () => {
        const daiAmount = tokenAmountToBigNumber("1000", 18);
        const minAmount = 0;

        // deposit into 3Pool
        await daiToken
          .connect(lpAccount)
          .approve(basePool.address, MAX_UINT256);
        await basePool["add_liquidity(uint256[3],uint256)"](
          [daiAmount, "0", "0"],
          minAmount
        );

        // deposit 3Crv into metapool
        let baseLpBalance = await baseLpToken.balanceOf(lpAccount.address);
        await baseLpToken
          .connect(lpAccount)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool["add_liquidity(uint256[2],uint256)"](
          ["0", baseLpBalance],
          minAmount
        );

        const basePoolDaiBalance = await basePool.balances(daiIndex - 1);
        const basePoolLpTotalSupply = await baseLpToken.totalSupply();

        // update LP Safe's base pool LP balance after depositing
        // into the metapool, which will swap for some primary underlyer
        const metaPoolBaseLpBalance = await metaPool.balances(1);
        const lpBalance = await lpToken.balanceOf(lpAccount.address);
        const lpTotalSupply = await lpToken.totalSupply();
        baseLpBalance = lpBalance.mul(metaPoolBaseLpBalance).div(lpTotalSupply);

        const expectedBalance = baseLpBalance
          .mul(basePoolDaiBalance)
          .div(basePoolLpTotalSupply);
        expect(expectedBalance).to.be.gt(0);

        const balance = await tvlManager.balanceOf(daiAllocationId);
        // allow a few wei deviation
        expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
      });

      it("Get 3Pool underlyer balance from gauge holding", async () => {
        const daiAmount = tokenAmountToBigNumber("1000", 18);
        const minAmount = 0;

        // deposit into 3Pool
        await daiToken
          .connect(lpAccount)
          .approve(basePool.address, MAX_UINT256);
        await basePool["add_liquidity(uint256[3],uint256)"](
          [daiAmount, "0", "0"],
          minAmount
        );

        // deposit 3Crv into metapool
        let baseLpBalance = await baseLpToken.balanceOf(lpAccount.address);
        await baseLpToken
          .connect(lpAccount)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool["add_liquidity(uint256[2],uint256)"](
          ["0", baseLpBalance],
          minAmount
        );

        await lpToken.connect(lpAccount).approve(gauge.address, MAX_UINT256);
        const lpBalance = await lpToken.balanceOf(lpAccount.address);
        await gauge["deposit(uint256)"](lpBalance);
        expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
        const gaugeLpBalance = await gauge.balanceOf(lpAccount.address);
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
        // allow a few wei deviation
        expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
      });

      it("Get 3Pool underlyer balance from combined holdings", async () => {
        const daiAmount = tokenAmountToBigNumber("1000", 18);
        const minAmount = 0;

        // deposit into 3Pool
        await daiToken
          .connect(lpAccount)
          .approve(basePool.address, MAX_UINT256);
        await basePool["add_liquidity(uint256[3],uint256)"](
          [daiAmount, "0", "0"],
          minAmount
        );

        // deposit 3Crv into metapool
        let baseLpBalance = await baseLpToken.balanceOf(lpAccount.address);
        await baseLpToken
          .connect(lpAccount)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool["add_liquidity(uint256[2],uint256)"](
          ["0", baseLpBalance],
          minAmount
        );

        // split LP tokens between strategy and gauge
        const totalLpBalance = await lpToken.balanceOf(lpAccount.address);
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

        await lpToken.connect(lpAccount).approve(gauge.address, MAX_UINT256);
        await gauge["deposit(uint256)"](gaugeLpBalance);

        expect(await lpToken.balanceOf(lpAccount.address)).to.equal(
          strategyLpBalance
        );
        expect(await gauge.balanceOf(lpAccount.address)).to.equal(
          gaugeLpBalance
        );

        const basePoolDaiBalance = await basePool.balances(daiIndex - 1);
        const basePoolLpTotalSupply = await baseLpToken.totalSupply();

        const expectedBalance = baseLpBalance
          .mul(basePoolDaiBalance)
          .div(basePoolLpTotalSupply);
        expect(expectedBalance).to.be.gt(0);

        const balance = await tvlManager.balanceOf(daiAllocationId);
        // allow a few wei deviation
        expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
      });

      it("Get primary underlyer balance from account holding", async () => {
        const ustAmount = tokenAmountToBigNumber("1000", 18);
        const ustIndex = 0;
        const minAmount = 0;

        // deposit primary underlyer into metapool
        await primaryToken
          .connect(lpAccount)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool["add_liquidity(uint256[2],uint256)"](
          [ustAmount, "0"],
          minAmount
        );

        const metaPoolUstBalance = await metaPool.balances(ustIndex);
        const lpBalance = await lpToken.balanceOf(lpAccount.address);
        const lpTotalSupply = await lpToken.totalSupply();
        const expectedBalance = lpBalance
          .mul(metaPoolUstBalance)
          .div(lpTotalSupply);

        const balance = await tvlManager.balanceOf(primaryAllocationId);
        // allow a few wei deviation
        expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
      });

      it("Get primary underlyer balance from gauge holding", async () => {
        const ustAmount = tokenAmountToBigNumber("1000", 18);
        const ustIndex = 0;
        const minAmount = 0;

        // deposit primary underlyer into metapool
        await primaryToken
          .connect(lpAccount)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool["add_liquidity(uint256[2],uint256)"](
          [ustAmount, "0"],
          minAmount
        );

        const metaPoolUstBalance = await metaPool.balances(ustIndex);

        await lpToken.connect(lpAccount).approve(gauge.address, MAX_UINT256);
        const lpBalance = await lpToken.balanceOf(lpAccount.address);
        await gauge["deposit(uint256)"](lpBalance);
        expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
        const gaugeLpBalance = await gauge.balanceOf(lpAccount.address);
        expect(gaugeLpBalance).to.equal(lpBalance);

        const lpTotalSupply = await lpToken.totalSupply();
        const expectedBalance = gaugeLpBalance
          .mul(metaPoolUstBalance)
          .div(lpTotalSupply);

        const balance = await tvlManager.balanceOf(primaryAllocationId);
        // allow a few wei deviation
        expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
      });

      it("Get primary underlyer balance from combined holdings", async () => {
        const ustAmount = tokenAmountToBigNumber("1000", 18);
        const ustIndex = 0;
        const minAmount = 0;

        // deposit primary underlyer into metapool
        await primaryToken
          .connect(lpAccount)
          .approve(metaPool.address, MAX_UINT256);
        await metaPool["add_liquidity(uint256[2],uint256)"](
          [ustAmount, "0"],
          minAmount
        );

        // split LP tokens between strategy and gauge
        const totalLpBalance = await lpToken.balanceOf(lpAccount.address);
        const strategyLpBalance = totalLpBalance.div(3);
        const gaugeLpBalance = totalLpBalance.sub(strategyLpBalance);
        expect(gaugeLpBalance).to.be.gt(0);
        expect(strategyLpBalance).to.be.gt(0);

        await lpToken.connect(lpAccount).approve(gauge.address, MAX_UINT256);
        await gauge["deposit(uint256)"](gaugeLpBalance);

        expect(await lpToken.balanceOf(lpAccount.address)).to.equal(
          strategyLpBalance
        );
        expect(await gauge.balanceOf(lpAccount.address)).to.equal(
          gaugeLpBalance
        );

        const metaPoolUstBalance = await metaPool.balances(ustIndex);
        const lpTotalSupply = await lpToken.totalSupply();

        const expectedBalance = totalLpBalance
          .mul(metaPoolUstBalance)
          .div(lpTotalSupply);

        const balance = await tvlManager.balanceOf(primaryAllocationId);
        // allow a few wei deviation
        expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
      });
    });
  });
});
