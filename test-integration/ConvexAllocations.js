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

const BOOSTER_ADDRESS = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";

const ConvexPoolAllocations = [
  {
    contractName: "Convex3poolAllocation",
    poolName: "3Pool",
    // using the Curve pool itself as the "whale":
    // should be ok since the pool's external balances (vs the pool's
    // internal balances) are only used for admin balances and determining
    // deposit amounts for "fee" assets.
    whaleAddress: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
    numberOfCoins: 3,
    interfaceOverride: {
      IStableSwap: "IStableSwap3",
    },
    unwrap: false,
  },
];

const ConvexMetaPoolAllocations = [
  // {
  //   contractName: "CurveUstAllocation",
  //   primaryUnderlyerSymbol: "UST",
  //   whaleAddress: "0x87dA823B6fC8EB8575a235A824690fda94674c88",
  // },
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

describe.only("Allocations", () => {
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

  ConvexPoolAllocations.forEach(function (allocationData) {
    const {
      contractName,
      poolName,
      whaleAddress,
      numberOfCoins,
      unwrap,
      interfaceOverride,
    } = allocationData;

    describe(`Convex ${poolName} allocation`, () => {
      let allocation;

      // Curve
      let lpToken;
      let stableSwap;
      // Convex
      let booster;
      let rewardContract;

      let underlyerToken;
      const underlyerIndices = Array.from(Array(numberOfCoins).keys());
      let lookupId;

      before("Deploy allocation contract", async () => {
        const ConvexAllocation = await ethers.getContractFactory(contractName);
        allocation = await ConvexAllocation.deploy();
        await allocation.deployed();
      });

      before("Register asset allocation", async () => {
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(allocation.address);
      });

      before("Attach to Mainnet contracts", async () => {
        // Curve
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

        // Convex
        booster = await getContractAt(
          "IBooster",
          BOOSTER_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const REWARD_CONTRACT_ADDRESS =
          await allocation.REWARD_CONTRACT_ADDRESS();
        rewardContract = await getContractAt(
          "IBaseRewardPool",
          REWARD_CONTRACT_ADDRESS,
          interfaceOverride,
          lpAccount
        );
      });

      underlyerIndices.forEach((underlyerIndex) => {
        describe(`Underlyer index: ${underlyerIndex}`, () => {
          before("Get allocation ID", async () => {
            lookupId = await tvlManager.testEncodeAssetAllocationId(
              allocation.address,
              underlyerIndex
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
            await acquireToken(
              sender,
              lpAccount,
              underlyerToken,
              amount,
              deployer
            );
          });

          it("Allocation should show zero underlyer balance by LP Account", async () => {
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
            await stableSwap[
              `add_liquidity(uint256[${numberOfCoins}],uint256)`
            ](amounts, minAmount);

            const strategyLpBalance = await lpToken.balanceOf(
              lpAccount.address
            );
            expect(strategyLpBalance).to.be.gt(0);

            const balance = await tvlManager.balanceOf(lookupId);
            expect(balance).to.equal(0);
          });

          it("Get underlyer balance from reward contract holding", async () => {
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
            await stableSwap[
              `add_liquidity(uint256[${numberOfCoins}],uint256)`
            ](amounts, minAmount);

            await lpToken
              .connect(lpAccount)
              .approve(booster.address, MAX_UINT256);
            const strategyLpBalance = await lpToken.balanceOf(
              lpAccount.address
            );
            await booster.deposit(9, strategyLpBalance, true);
            expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
            const rewardContractLpBalance = await rewardContract.balanceOf(
              lpAccount.address
            );
            expect(rewardContractLpBalance).to.be.gt(0);

            const poolBalance = await stableSwap.balances(underlyerIndex);
            const lpTotalSupply = await lpToken.totalSupply();

            let expectedBalance = rewardContractLpBalance
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
    });
  });

  ConvexMetaPoolAllocations.forEach(function (allocationData) {
    const {
      contractName,
      primaryUnderlyerSymbol,
      whaleAddress,
      interfaceOverride,
    } = allocationData;

    describe(`Convex ${primaryUnderlyerSymbol} allocation`, () => {
      let allocation;
      let convex3poolAllocation;

      // MetaPool
      let lpToken;
      let metaPool;
      // Curve 3pool;
      let baseLpToken;
      let basePool;
      // Convex
      let booster;
      let rewardContract;

      before("Deploy allocation contracts", async () => {
        const Convex3poolAllocation = await ethers.getContractFactory(
          "Convex3poolAllocation"
        );
        convex3poolAllocation = await Convex3poolAllocation.deploy();
        const ConvexAllocation = await ethers.getContractFactory(contractName);
        allocation = await ConvexAllocation.deploy(
          convex3poolAllocation.address
        );
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

        // 3pool
        const BASE_POOL_ADDRESS =
          await convex3poolAllocation.STABLE_SWAP_ADDRESS();
        basePool = await getContractAt(
          "IStableSwap",
          BASE_POOL_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        const BASE_LP_TOKEN_ADDRESS =
          await convex3poolAllocation.LP_TOKEN_ADDRESS();
        baseLpToken = await getContractAt(
          "IDetailedERC20",
          BASE_LP_TOKEN_ADDRESS,
          interfaceOverride,
          lpAccount
        );

        // Convex
        booster = await getContractAt(
          "IBooster",
          BOOSTER_ADDRESS,
          interfaceOverride,
          lpAccount
        );
        const REWARD_CONTRACT_ADDRESS =
          await allocation.REWARD_CONTRACT_ADDRESS();
        rewardContract = await getContractAt(
          "ILiquidityGauge",
          REWARD_CONTRACT_ADDRESS,
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

        it("Allocation should show zero primary underlyer balance by LP Account", async () => {
          const primaryAmount = tokenAmountToBigNumber("1000", 18);
          const minAmount = 0;

          // deposit primary underlyer into metapool
          await primaryToken
            .connect(lpAccount)
            .approve(metaPool.address, MAX_UINT256);
          await metaPool["add_liquidity(uint256[2],uint256)"](
            [primaryAmount, "0"],
            minAmount
          );

          const lpBalance = await lpToken.balanceOf(lpAccount.address);
          expect(lpBalance).to.be.gt(0);

          const balance = await tvlManager.balanceOf(primaryAllocationId);
          expect(balance).to.equal(0);
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

          await lpToken
            .connect(lpAccount)
            .approve(booster.address, MAX_UINT256);
          const lpBalance = await lpToken.balanceOf(lpAccount.address);
          await booster.deposit(9, lpBalance, true);
          expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
          const gaugeLpBalance = await rewardContract.balanceOf(
            lpAccount.address
          );
          expect(gaugeLpBalance).to.equal(lpBalance);

          const lpTotalSupply = await lpToken.totalSupply();
          const expectedBalance = gaugeLpBalance
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

          it("Allocation should show zero 3Pool underlyer balance by LP Account", async () => {
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

            const lpBalance = await lpToken.balanceOf(lpAccount.address);
            expect(lpBalance).to.be.gt(0);

            const balance = await tvlManager.balanceOf(lookupId);
            expect(balance).to.equal(0);
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
              .approve(booster.address, MAX_UINT256);
            const lpBalance = await lpToken.balanceOf(lpAccount.address);
            await booster.deposit(9, lpBalance, true);
            expect(await lpToken.balanceOf(lpAccount.address)).to.equal(0);
            const gaugeLpBalance = await rewardContract.balanceOf(
              lpAccount.address
            );
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
        });
      });
    });
  });
});
