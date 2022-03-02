const hre = require("hardhat");
const { expect } = require("chai");
const { ethers, waffle, artifacts } = hre;
const { BigNumber } = ethers;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
  FAKE_ADDRESS,
  bytes32,
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");

const CRV_ADDRESS = "0xD533a949740bb3306d119CC777fa900bA034cd52";

const pinnedBlock = 13755900;
const defaultPinnedBlock = hre.config.networks.hardhat.forking.blockNumber;
const forkingUrl = hre.config.networks.hardhat.forking.url;

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Curve MetaPool Zaps (Updated block) - LP Account integration", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let adminSafe;
  let lpSafe;
  let treasurySafe;

  /* deployed contracts */
  let lpAccount;
  let tvlManager;
  let erc20Allocation;

  /* mocks */
  let addressRegistry;

  // use EVM snapshots for test isolation
  let snapshotId;

  const CurveMetaPoolZaps = [
    {
      contractName: "CurveOusdZap",
      swapAddress: "0x87650D7bbfC3A9F10587d7778206671719d9910D",
      swapInterface: "IMetaPool",
      lpTokenAddress: "0x87650D7bbfC3A9F10587d7778206671719d9910D",
      gaugeAddress: "0x25f0cE4E2F8dbA112D9b115710AC297F816087CD",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["OUSD"],
      rewardToken: "0x8207c1FfC5B6804F6024322CcF34F29c3541Ae26",
    },
  ];

  async function getTotalNormalizedBalance(allocationIds) {
    let totalNormalizedBalance = BigNumber.from(0);
    for (const id of allocationIds) {
      const balance = await tvlManager.balanceOf(id);
      const decimals = await tvlManager.decimalsOf(id);
      // normalize each balance to 18 decimals
      const normalizedBalance = balance
        .mul(BigNumber.from(10).pow(18))
        .div(BigNumber.from(10).pow(decimals));
      totalNormalizedBalance = totalNormalizedBalance.add(normalizedBalance);
    }
    return totalNormalizedBalance;
  }

  async function numAllocationIds(zap) {
    const numErc20s = (await zap.erc20Allocations()).length;
    const allocationNames = await zap.assetAllocations();
    let totalNumIds = numErc20s;
    for (const name of allocationNames) {
      const allocationAddress = await tvlManager.getAssetAllocation(name);
      const allocation = await ethers.getContractAt(
        "ImmutableAssetAllocation",
        allocationAddress
      );
      const numTokens = (await allocation.tokens()).length;
      totalNumIds += numTokens;
    }
    return totalNumIds;
  }

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Use pinned block for new zaps", async () => {
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
    [deployer, lpSafe, emergencySafe, adminSafe, treasurySafe] =
      await ethers.getSigners();

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
    // claiming requires Treasury Safe address to send fees to
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("treasurySafe"))
      .returns(treasurySafe.address);
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

    const LpAccountV2 = await ethers.getContractFactory("LpAccountV2");
    const logicV2 = await LpAccountV2.deploy();
    const initV2Data = LpAccountV2.interface.encodeFunctionData(
      "initializeUpgrade()",
      []
    );
    await proxyAdmin.upgradeAndCall(proxy.address, logicV2.address, initV2Data);

    lpAccount = await LpAccountV2.attach(proxy.address);

    await addressRegistry.mock.lpAccountAddress.returns(lpAccount.address);
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

  CurveMetaPoolZaps.forEach((curveConstants) => {
    const {
      contractName,
      swapAddress,
      swapInterface,
      lpTokenAddress,
      gaugeAddress,
      gaugeInterface,
      numberOfCoins,
      rewardToken,
    } = curveConstants;
    let { whaleAddress } = curveConstants;

    describe(contractName, () => {
      let zap;
      let metaPool;
      let lpToken;
      let gauge;
      let basePool;

      let curve3poolAllocation;

      let underlyerToken;
      const underlyerIndices = Array.from(Array(numberOfCoins).keys());

      let subSuiteSnapshotId;

      before(async () => {
        let snapshot = await timeMachine.takeSnapshot();
        subSuiteSnapshotId = snapshot["result"];
      });

      after(async () => {
        await timeMachine.revertToSnapshot(subSuiteSnapshotId);
      });

      before("Deploy Zap", async () => {
        const zapFactory = await ethers.getContractFactory(
          contractName,
          adminSafe
        );
        zap = await zapFactory.deploy();
      });

      before("Register zap with LP Account", async () => {
        await lpAccount.connect(adminSafe).registerZap(zap.address);
      });

      before("Attach to Mainnet Curve contracts", async () => {
        metaPool = await ethers.getContractAt(
          swapInterface,
          swapAddress,
          adminSafe
        );
        lpToken = await ethers.getContractAt(
          "IDetailedERC20",
          lpTokenAddress,
          adminSafe
        );
        gauge = await ethers.getContractAt(
          gaugeInterface,
          gaugeAddress,
          adminSafe
        );

        // 3pool
        basePool = await ethers.getContractAt(
          "IStableSwap",
          "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"
        );
      });

      before("Deploy 3pool allocation", async () => {
        const Curve3poolAllocation = await ethers.getContractFactory(
          "Curve3poolAllocation"
        );
        curve3poolAllocation = await Curve3poolAllocation.deploy();
      });

      before("Register allocations with TVL Manager", async () => {
        const allocationNames = await zap.assetAllocations();
        for (let name of allocationNames) {
          name = name
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join("");
          if (name === "Aave") {
            name = "AaveStableCoin";
          }
          const allocationContractName = name + "Allocation";
          const allocationFactory = await ethers.getContractFactory(
            allocationContractName
          );
          const allocation = await allocationFactory.deploy(
            curve3poolAllocation.address
          );
          await tvlManager
            .connect(adminSafe)
            .registerAssetAllocation(allocation.address);
        }
      });

      before("Register tokens with ERC20 Allocation", async () => {
        const erc20s = await zap.erc20Allocations();
        for (const token of erc20s) {
          await erc20Allocation
            .connect(adminSafe)
            ["registerErc20Token(address)"](token);
        }
      });

      underlyerIndices.forEach((underlyerIndex) => {
        const startingTokens = 100000;

        describe(`Underlyer index: ${underlyerIndex}`, () => {
          beforeEach("Fund LP Account with Pool Underlyer", async () => {
            let underlyerAddress;
            if (underlyerIndex == 0) {
              underlyerAddress = await metaPool.coins(underlyerIndex);
            } else {
              underlyerAddress = await basePool.coins(underlyerIndex - 1);
              whaleAddress = basePool.address;
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
              lpAccount.address,
              underlyerToken,
              amount,
              deployer
            );
          });

          it("Deploy and unwind", async () => {
            const amounts = new Array(numberOfCoins).fill("0");
            const underlyerAmount = tokenAmountToBigNumber(
              1000,
              await underlyerToken.decimals()
            );
            amounts[underlyerIndex] = underlyerAmount;

            const name = await zap.NAME();
            await lpAccount.connect(lpSafe).deployStrategy(name, amounts);

            const prevUnderlyerBalance = await underlyerToken.balanceOf(
              lpAccount.address
            );
            expect(prevUnderlyerBalance).gt(0);
            const prevLpBalance = await lpToken.balanceOf(lpAccount.address);
            expect(prevLpBalance).to.equal(0);
            const prevGaugeLpBalance = await gauge.balanceOf(lpAccount.address);
            expect(prevGaugeLpBalance).gt(0);

            await lpAccount
              .connect(lpSafe)
              .unwindStrategy(name, prevGaugeLpBalance, underlyerIndex);

            const afterUnderlyerBalance = await underlyerToken.balanceOf(
              lpAccount.address
            );
            expect(afterUnderlyerBalance).gt(prevUnderlyerBalance);
            const afterLpBalance = await lpToken.balanceOf(lpAccount.address);
            expect(afterLpBalance).to.equal(0);
            const afterGaugeLpBalance = await gauge.balanceOf(
              lpAccount.address
            );
            expect(afterGaugeLpBalance).to.equal(0);
          });

          it("Claim", async () => {
            const crv = await ethers.getContractAt(
              "IDetailedERC20",
              CRV_ADDRESS
            );
            const erc20s = await zap.erc20Allocations();

            // may remove CRV from erc20 allocations in the future, like with
            // other reward tokens, to avoid impacting TVL with slippage
            expect(erc20s).to.include(ethers.utils.getAddress(crv.address));

            expect(await crv.balanceOf(lpAccount.address)).to.equal(0);
            expect(await crv.balanceOf(treasurySafe.address)).to.equal(0);

            if (typeof rewardToken !== "undefined") {
              expect(erc20s).to.include(ethers.utils.getAddress(rewardToken));
              const token = await ethers.getContractAt(
                "IDetailedERC20",
                rewardToken
              );
              expect(await token.balanceOf(lpAccount.address)).to.equal(0);
            }

            const amounts = new Array(numberOfCoins).fill("0");
            const underlyerAmount = tokenAmountToBigNumber(
              100000,
              await underlyerToken.decimals()
            );
            amounts[underlyerIndex] = underlyerAmount;

            const name = await zap.NAME();
            await lpAccount.connect(lpSafe).deployStrategy(name, amounts);

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

            // setup reward tokens for fees
            await lpAccount
              .connect(adminSafe)
              .registerRewardFee(crv.address, 1500);

            await lpAccount.connect(lpSafe).claim([name]);

            expect(await crv.balanceOf(lpAccount.address)).to.be.gt(0);
            if (typeof rewardToken !== "undefined") {
              const token = await ethers.getContractAt(
                "IDetailedERC20",
                rewardToken
              );
              expect(await token.balanceOf(lpAccount.address)).to.be.gt(0);
            }

            // check fees taken out
            expect(await crv.balanceOf(treasurySafe.address)).to.be.gt(0);
          });

          it("Allocation picks up deployed balances", async () => {
            const allocationIds = await tvlManager.getAssetAllocationIds();
            const expectedNumIds = await numAllocationIds(zap);
            expect(allocationIds.length).to.equal(expectedNumIds);

            const totalNormalizedBalance = await getTotalNormalizedBalance(
              allocationIds
            );

            const amounts = new Array(numberOfCoins).fill("0");
            const decimals = await underlyerToken.decimals();
            // deposit 1% of the starting amount
            const underlyerAmount = tokenAmountToBigNumber(
              startingTokens * 0.01,
              decimals
            );
            amounts[underlyerIndex] = underlyerAmount;

            const name = await zap.NAME();
            await lpAccount.connect(lpSafe).deployStrategy(name, amounts);

            // allow some deviation from diverging stablecoin rates
            const normalizedUnderlyerAmount = underlyerAmount
              .mul(BigNumber.from(10).pow(18))
              .div(BigNumber.from(10).pow(decimals));
            const deviation = normalizedUnderlyerAmount.div(100);

            let newTotalNormalizedAmount = await getTotalNormalizedBalance(
              allocationIds
            );
            expect(
              newTotalNormalizedAmount.sub(totalNormalizedBalance).abs()
            ).to.be.lt(deviation);

            const gaugeLpBalance = await gauge.balanceOf(lpAccount.address);
            await lpAccount
              .connect(lpSafe)
              .unwindStrategy(name, gaugeLpBalance, underlyerIndex);

            newTotalNormalizedAmount = await getTotalNormalizedBalance(
              allocationIds
            );
            expect(
              newTotalNormalizedAmount.sub(totalNormalizedBalance).abs()
            ).to.be.lt(deviation);
          });
        });
      });
    });
  });
});
