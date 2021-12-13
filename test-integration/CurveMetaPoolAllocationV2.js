const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
  MAX_UINT256,
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

const CurveMetaPoolAllocationV2s = [
  {
    contractName: "CurveUstAllocationV2",
    primaryUnderlyerSymbol: "UST",
    whaleAddress: "0x87dA823B6fC8EB8575a235A824690fda94674c88",
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
  let suiteSnapshotId;
  let testSnapshotId;

  before(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    suiteSnapshotId = snapshot["result"];
  });

  after(async () => {
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    testSnapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(testSnapshotId);
  });

  before(async () => {
    [deployer, emergencySafe, adminSafe, mApt, lpAccount] =
      await ethers.getSigners();

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

  CurveMetaPoolAllocationV2s.forEach(function (allocationData) {
    const {
      contractName,
      primaryUnderlyerSymbol,
      whaleAddress,
      interfaceOverride,
    } = allocationData;

    describe(`Curve ${primaryUnderlyerSymbol} allocation`, () => {
      let allocation;
      let curve3poolAllocation;

      // MetaPool
      let lpToken;
      let metaPool;
      let gauge;
      // Curve 3pool;
      let baseLpToken;
      let basePool;

      before("Deploy allocation contracts", async () => {
        const Curve3poolAllocation = await ethers.getContractFactory(
          "Curve3poolAllocation"
        );
        curve3poolAllocation = await Curve3poolAllocation.deploy();
        const CurveAllocation = await ethers.getContractFactory(contractName);
        allocation = await CurveAllocation.deploy(curve3poolAllocation.address);
      });

      before("Register asset allocation", async () => {
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(allocation.address);
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

        // 3pool
        const BASE_POOL_ADDRESS =
          await curve3poolAllocation.STABLE_SWAP_ADDRESS();
        basePool = await getContractAt(
          "IStableSwap",
          BASE_POOL_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const BASE_LP_TOKEN_ADDRESS =
          await curve3poolAllocation.LP_TOKEN_ADDRESS();
        baseLpToken = await getContractAt(
          "IDetailedERC20",
          BASE_LP_TOKEN_ADDRESS,
          interfaceOverride,
          lpAccount
        );
      });

      describe("Primary underlyer", () => {
        let primaryToken;
        let primaryAllocationId;
        const primaryIndex = 0;

        before("Get allocation ID", async () => {
          primaryAllocationId = await tvlManager.testEncodeAssetAllocationId(
            allocation.address,
            primaryIndex
          );
        });

        before(`Prepare account 0 with ${primaryUnderlyerSymbol}`, async () => {
          const PRIMARY_UNDERLYER_ADDRESS =
            await allocation.PRIMARY_UNDERLYER();
          primaryToken = await ethers.getContractAt(
            "IDetailedERC20",
            PRIMARY_UNDERLYER_ADDRESS
          );
          const amount = tokenAmountToBigNumber(
            100000,
            await primaryToken.decimals()
          );
          const sender = whaleAddress;
          await acquireToken(sender, lpAccount, primaryToken, amount, deployer);
        });

        it("Get primary underlyer balance from account holding", async () => {
          const primaryAmount = tokenAmountToBigNumber("1000", 18);
          const primaryIndex = 0;
          const minAmount = 0;

          // deposit primary underlyer into metapool
          await primaryToken
            .connect(lpAccount)
            .approve(metaPool.address, MAX_UINT256);
          await metaPool["add_liquidity(uint256[2],uint256)"](
            [primaryAmount, "0"],
            minAmount
          );

          const metaPoolPrimaryBalance = await metaPool.balances(primaryIndex);
          const lpBalance = await lpToken.balanceOf(lpAccount.address);
          const lpTotalSupply = await lpToken.totalSupply();
          const expectedBalance = lpBalance
            .mul(metaPoolPrimaryBalance)
            .div(lpTotalSupply);

          const balance = await tvlManager.balanceOf(primaryAllocationId);
          // allow a few wei deviation
          expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
        });

        it("Get primary underlyer balance from gauge holding", async () => {
          const primaryAmount = tokenAmountToBigNumber("1000", 18);
          const primaryIndex = 0;
          const minAmount = 0;

          // deposit primary underlyer into metapool
          await primaryToken
            .connect(lpAccount)
            .approve(metaPool.address, MAX_UINT256);
          await metaPool["add_liquidity(uint256[2],uint256)"](
            [primaryAmount, "0"],
            minAmount
          );

          const metaPoolPrimaryBalance = await metaPool.balances(primaryIndex);

          await lpToken.connect(lpAccount).approve(gauge.address, MAX_UINT256);
          const lpBalance = await lpToken.balanceOf(lpAccount.address);
          await gauge["deposit(uint256)"](lpBalance);
          expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
          const gaugeLpBalance = await gauge.balanceOf(lpAccount.address);
          expect(gaugeLpBalance).to.equal(lpBalance);

          const lpTotalSupply = await lpToken.totalSupply();
          const expectedBalance = gaugeLpBalance
            .mul(metaPoolPrimaryBalance)
            .div(lpTotalSupply);

          const balance = await tvlManager.balanceOf(primaryAllocationId);
          // allow a few wei deviation
          expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
        });

        it("Get primary underlyer balance from combined holdings", async () => {
          const primaryAmount = tokenAmountToBigNumber("1000", 18);
          const primaryIndex = 0;
          const minAmount = 0;

          // deposit primary underlyer into metapool
          await primaryToken
            .connect(lpAccount)
            .approve(metaPool.address, MAX_UINT256);
          await metaPool["add_liquidity(uint256[2],uint256)"](
            [primaryAmount, "0"],
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

          const metaPoolPrimaryBalance = await metaPool.balances(primaryIndex);
          const lpTotalSupply = await lpToken.totalSupply();

          const expectedBalance = totalLpBalance
            .mul(metaPoolPrimaryBalance)
            .div(lpTotalSupply);

          const balance = await tvlManager.balanceOf(primaryAllocationId);
          // allow a few wei deviation
          expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
        });
      });

      [1, 2, 3].forEach((underlyerIndex) => {
        const basePoolIndex = underlyerIndex - 1;

        describe(`3Pool index: ${basePoolIndex}`, () => {
          let underlyerToken;
          let underlyerDecimals;
          let lookupId;

          before("Get allocation ID", async () => {
            lookupId = await tvlManager.testEncodeAssetAllocationId(
              allocation.address,
              underlyerIndex
            );
          });

          before("Fund account 0 with pool underlyer", async () => {
            const underlyerAddress = await basePool.coins(basePoolIndex);
            underlyerToken = await ethers.getContractAt(
              "IDetailedERC20",
              underlyerAddress
            );
            underlyerDecimals = await underlyerToken.decimals();

            const amount = tokenAmountToBigNumber(
              100000,
              await underlyerToken.decimals()
            );
            let sender = WHALE_POOLS["DAI"];
            await acquireToken(
              sender,
              lpAccount,
              underlyerToken,
              amount,
              deployer
            );
          });

          it("Get 3Pool underlyer balance from account holding", async () => {
            const amounts = ["0", "0", "0"];
            amounts[basePoolIndex] = tokenAmountToBigNumber(
              "1000",
              underlyerDecimals
            );
            const minAmount = 0;

            // deposit into 3Pool
            await underlyerToken
              .connect(lpAccount)
              .approve(basePool.address, MAX_UINT256);
            await basePool["add_liquidity(uint256[3],uint256)"](
              amounts,
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

            const basePoolDaiBalance = await basePool.balances(basePoolIndex);
            const basePoolLpTotalSupply = await baseLpToken.totalSupply();

            // update LP Safe's base pool LP balance after depositing
            // into the metapool, which will swap for some primary underlyer
            const metaPoolBaseLpBalance = await metaPool.balances(1);
            const lpBalance = await lpToken.balanceOf(lpAccount.address);
            const lpTotalSupply = await lpToken.totalSupply();
            baseLpBalance = lpBalance
              .mul(metaPoolBaseLpBalance)
              .div(lpTotalSupply);

            const expectedBalance = baseLpBalance
              .mul(basePoolDaiBalance)
              .div(basePoolLpTotalSupply);
            expect(expectedBalance).to.be.gt(0);

            const balance = await tvlManager.balanceOf(lookupId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });

          it("Get 3Pool underlyer balance from gauge holding", async () => {
            const amounts = ["0", "0", "0"];
            amounts[basePoolIndex] = tokenAmountToBigNumber(
              "1000",
              underlyerDecimals
            );
            const minAmount = 0;

            // deposit into 3Pool
            await underlyerToken
              .connect(lpAccount)
              .approve(basePool.address, MAX_UINT256);
            await basePool["add_liquidity(uint256[3],uint256)"](
              amounts,
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

            await lpToken
              .connect(lpAccount)
              .approve(gauge.address, MAX_UINT256);
            const lpBalance = await lpToken.balanceOf(lpAccount.address);
            await gauge["deposit(uint256)"](lpBalance);
            expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
            const gaugeLpBalance = await gauge.balanceOf(lpAccount.address);
            expect(gaugeLpBalance).to.equal(lpBalance);

            const basePoolDaiBalance = await basePool.balances(basePoolIndex);
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

            const balance = await tvlManager.balanceOf(lookupId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });

          it("Get 3Pool underlyer balance from combined holdings", async () => {
            const amounts = ["0", "0", "0"];
            amounts[basePoolIndex] = tokenAmountToBigNumber(
              "1000",
              underlyerDecimals
            );
            const minAmount = 0;

            // deposit into 3Pool
            await underlyerToken
              .connect(lpAccount)
              .approve(basePool.address, MAX_UINT256);
            await basePool["add_liquidity(uint256[3],uint256)"](
              amounts,
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

            await lpToken
              .connect(lpAccount)
              .approve(gauge.address, MAX_UINT256);
            await gauge["deposit(uint256)"](gaugeLpBalance);

            expect(await lpToken.balanceOf(lpAccount.address)).to.equal(
              strategyLpBalance
            );
            expect(await gauge.balanceOf(lpAccount.address)).to.equal(
              gaugeLpBalance
            );

            const basePoolDaiBalance = await basePool.balances(basePoolIndex);
            const basePoolLpTotalSupply = await baseLpToken.totalSupply();

            const expectedBalance = baseLpBalance
              .mul(basePoolDaiBalance)
              .div(basePoolLpTotalSupply);
            expect(expectedBalance).to.be.gt(0);

            const balance = await tvlManager.balanceOf(lookupId);
            // allow a few wei deviation
            expect(balance.sub(expectedBalance).abs()).to.be.lt(3);
          });
        });
      });
    });
  });
});
