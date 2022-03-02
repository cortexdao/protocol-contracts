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

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Curve MetaPool Zaps - LP Account integration", () => {
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
      contractName: "CurveAlusdZap",
      swapAddress: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
      swapInterface: "IMetaPool",
      lpTokenAddress: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
      gaugeAddress: "0x9582C4ADACB3BCE56Fea3e590F05c3ca2fb9C477",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["ALUSD"],
      rewardToken: "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF",
    },
    {
      contractName: "CurveBusdv2Zap",
      swapAddress: "0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
      swapInterface: "IMetaPool",
      lpTokenAddress: "0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a",
      gaugeAddress: "0xd4B22fEdcA85E684919955061fDf353b9d38389b",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["BUSD"],
    },
    {
      contractName: "CurveFraxZap",
      swapAddress: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
      swapInterface: "IMetaPool",
      lpTokenAddress: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
      gaugeAddress: "0x72E158d38dbd50A483501c24f792bDAAA3e7D55C",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["FRAX"],
      rewardToken: "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0",
    },
    {
      contractName: "CurveLusdZap",
      swapAddress: "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA",
      swapInterface: "IMetaPool",
      lpTokenAddress: "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA",
      gaugeAddress: "0x9B8519A9a00100720CCdC8a120fBeD319cA47a14",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["LUSD"],
    },
    {
      contractName: "CurveMusdZap",
      swapAddress: "0x8474DdbE98F5aA3179B3B3F5942D724aFcdec9f6",
      swapInterface: "IMetaPool",
      lpTokenAddress: "0x1AEf73d49Dedc4b1778d0706583995958Dc862e6",
      gaugeAddress: "0x5f626c30EC1215f4EdCc9982265E8b1F411D1352",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["MUSD"],
    },
    // {
    //   contractName: "CurveUsdnZap",
    //   swapAddress: "0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1",
    //   swapInterface: "IMetaPool",
    //   lpTokenAddress: "0x4f3E8F405CF5aFC05D68142F3783bDfE13811522",
    //   gaugeAddress: "0xF98450B5602fa59CC66e1379DFfB6FDDc724CfC4",
    //   gaugeInterface: "ILiquidityGauge",
    //   numberOfCoins: 4,
    //   whaleAddress: WHALE_POOLS["USDN"],
    // },
    {
      contractName: "CurveUsdpZap",
      swapAddress: "0x42d7025938bEc20B69cBae5A77421082407f053A",
      swapInterface: "IMetaPool",
      lpTokenAddress: "0x7Eb40E450b9655f4B3cC4259BCC731c63ff55ae6",
      gaugeAddress: "0x055be5DDB7A925BfEF3417FC157f53CA77cA7222",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["USDP"],
    },
    {
      contractName: "CurveUstZap",
      swapAddress: "0x890f4e345B1dAED0367A877a1612f86A1f86985f",
      swapInterface: "IMetaPool",
      lpTokenAddress: "0x94e131324b6054c0D789b190b2dAC504e4361b53",
      gaugeAddress: "0x3B7020743Bc2A4ca9EaF9D0722d42E20d6935855",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["UST"],
    },
    {
      contractName: "CurveMimZap",
      swapAddress: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
      swapInterface: "IMetaPool",
      lpTokenAddress: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
      gaugeAddress: "0xd8b712d29381748dB89c36BCa0138d7c75866ddF",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["MIM"],
      rewardToken: "0x090185f2135308BaD17527004364eBcC2D37e5F6",
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
