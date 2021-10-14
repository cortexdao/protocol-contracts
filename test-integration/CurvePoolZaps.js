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

describe("Curve Pool Zaps - LP Account integration", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let adminSafe;
  let lpSafe;

  /* deployed contracts */
  let lpAccount;
  let tvlManager;
  let erc20Allocation;

  /* mocks */
  let addressRegistry;

  // use EVM snapshots for test isolation
  let snapshotId;

  // "regular" pools; meta pools should be added in `CurveMetaPoolZaps`
  const CurvePoolZaps = [
    {
      contractName: "Curve3poolZap",
      swapAddress: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
      gaugeAddress: "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 3,
      whaleAddress: WHALE_POOLS["DAI"],
    },
    {
      contractName: "CurveAaveZap",
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
      contractName: "CurveSaaveZap",
      swapAddress: "0xEB16Ae0052ed37f479f7fe63849198Df1765a733",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x02d341CcB60fAaf662bC0554d13778015d1b285C",
      gaugeAddress: "0x462253b8F74B72304c145DB0e4Eebd326B22ca39",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["DAI"],
      useUnwrapped: true,
    },
    {
      contractName: "CurveCompoundZap",
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
      contractName: "CurveIronbankZap",
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
      contractName: "CurveSusdv2Zap",
      swapAddress: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
      swapInterface: "IOldStableSwap4",
      lpTokenAddress: "0xC25a3A3b969415c80451098fa907EC722572917F",
      gaugeAddress: "0xA90996896660DEcC6E997655E065b23788857849",
      gaugeInterface: "ILiquidityGauge",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["DAI"],
      rewardToken: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
    },
  ];

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Setup mock address registry", async () => {
    [deployer, lpSafe, emergencySafe, adminSafe] = await ethers.getSigners();

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

    lpAccount = await LpAccount.attach(proxy.address);

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

  CurvePoolZaps.forEach((curveConstants) => {
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
    } = curveConstants;

    describe(contractName, () => {
      let zap;
      let stableSwap;
      let lpToken;
      let gauge;

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

      before("Deploy zap", async () => {
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
        stableSwap = await ethers.getContractAt(
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
          const allocation = await allocationFactory.deploy();
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
          beforeEach("Fund LP Account with pool underlyer", async () => {
            let underlyerAddress;
            if (useUnwrapped) {
              underlyerAddress = await stableSwap.underlying_coins(
                underlyerIndex
              );
            } else {
              underlyerAddress = await stableSwap.coins(underlyerIndex);
            }

            underlyerToken = await ethers.getContractAt(
              "IDetailedERC20",
              underlyerAddress
            );
            const amount = tokenAmountToBigNumber(
              startingTokens,
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
            // deposit 1% of the starting amount
            const underlyerAmount = tokenAmountToBigNumber(
              startingTokens * 0.01,
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
            const erc20s = await zap.erc20Allocations();

            expect(erc20s).to.include(ethers.utils.getAddress(CRV_ADDRESS));
            const crv = await ethers.getContractAt(
              "IDetailedERC20",
              CRV_ADDRESS
            );
            expect(await crv.balanceOf(lpAccount.address)).to.equal(0);

            if (typeof rewardToken !== "undefined") {
              expect(erc20s).to.include(ethers.utils.getAddress(rewardToken));
              const token = await ethers.getContractAt(
                "IDetailedERC20",
                rewardToken
              );
              expect(await token.balanceOf(lpAccount.address)).to.equal(0);
            }

            const amounts = new Array(numberOfCoins).fill("0");
            // deposit 1% of the starting amount
            const underlyerAmount = tokenAmountToBigNumber(
              startingTokens * 0.01,
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

            await lpAccount.connect(lpSafe).claim(name);

            expect(await crv.balanceOf(lpAccount.address)).to.be.gt(0);
            if (typeof rewardToken !== "undefined") {
              const token = await ethers.getContractAt(
                "IDetailedERC20",
                rewardToken
              );
              expect(await token.balanceOf(lpAccount.address)).to.be.gt(0);
            }
          });

          async function getTotalNormalizedBalance(allocationIds) {
            let totalNormalizedBalance = new BigNumber.from(0);
            for (const id of allocationIds) {
              const balance = await tvlManager.balanceOf(id);
              const decimals = await tvlManager.decimalsOf(id);
              // normalize each balance to 18 decimals
              const normalizedBalance = balance
                .mul(new BigNumber.from(10).pow(18))
                .div(new BigNumber.from(10).pow(decimals));
              totalNormalizedBalance = totalNormalizedBalance.add(
                normalizedBalance
              );
            }
            return totalNormalizedBalance;
          }

          it("Allocation picks up deployed balances", async () => {
            const allocationIds = await tvlManager.getAssetAllocationIds();

            const totalNormalizedBalance = await getTotalNormalizedBalance(
              allocationIds
            );
            console.log("Total normalized balance: %s", totalNormalizedBalance);

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
            const deviation = underlyerAmount.div(100);

            let newTotalNormalizedAmount = await getTotalNormalizedBalance(
              allocationIds
            );
            expect(
              newTotalNormalizedAmount.sub(totalNormalizedBalance)
            ).to.be.lt(deviation);

            const gaugeLpBalance = await gauge.balanceOf(lpAccount.address);
            await lpAccount
              .connect(lpSafe)
              .unwindStrategy(name, gaugeLpBalance, underlyerIndex);

            newTotalNormalizedAmount = await getTotalNormalizedBalance(
              allocationIds
            );
            expect(
              newTotalNormalizedAmount.sub(totalNormalizedBalance)
            ).to.be.lt(deviation);
          });
        });
      });
    });
  });
});
