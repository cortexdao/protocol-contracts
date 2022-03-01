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
const CVX_ADDRESS = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B";

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

const pinnedBlock = 13616400;
const defaultPinnedBlock = hre.config.networks.hardhat.forking.blockNumber;
const forkingUrl = hre.config.networks.hardhat.forking.url;

describe("Convex Zaps - LP Account integration", () => {
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

  // "regular" pools; meta pools should be added in `ConvexMetaPoolZaps`
  const ConvexZaps = [
    {
      contractName: "Convex3poolZap",
      swapAddress: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
      rewardContractAddress: "0x689440f2Ff927E1f24c72F1087E1FAF471eCe1c8",
      rewardContractInterface: "IBaseRewardPool",
      numberOfCoins: 3,
      whaleAddress: WHALE_POOLS["DAI"],
    },
    {
      contractName: "ConvexAaveZap",
      swapAddress: "0xDeBF20617708857ebe4F679508E7b7863a8A8EeE",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900",
      rewardContractAddress: "0xE82c1eB4BC6F92f85BF7EB6421ab3b882C3F5a7B",
      rewardContractInterface: "IBaseRewardPool",
      numberOfCoins: 3,
      whaleAddress: WHALE_POOLS["DAI"],
      useUnwrapped: true,
    },
    {
      contractName: "ConvexSaaveZap",
      swapAddress: "0xEB16Ae0052ed37f479f7fe63849198Df1765a733",
      swapInterface: "IStableSwap",
      lpTokenAddress: "0x02d341CcB60fAaf662bC0554d13778015d1b285C",
      rewardContractAddress: "0xF86AE6790654b70727dbE58BF1a863B270317fD0",
      rewardContractInterface: "IBaseRewardPool",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["DAI"],
      useUnwrapped: true,
    },
    {
      contractName: "ConvexCompoundZap",
      swapAddress: "0xeB21209ae4C2c9FF2a86ACA31E123764A3B6Bc06",
      swapInterface: "IDepositZap",
      lpTokenAddress: "0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2",
      rewardContractAddress: "0xf34DFF761145FF0B05e917811d488B441F33a968",
      rewardContractInterface: "IBaseRewardPool",
      numberOfCoins: 2,
      whaleAddress: WHALE_POOLS["DAI"],
      useUnwrapped: true,
    },
    {
      contractName: "ConvexSusdv2Zap",
      swapAddress: "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD",
      swapInterface: "IOldStableSwap4",
      lpTokenAddress: "0xC25a3A3b969415c80451098fa907EC722572917F",
      rewardContractAddress: "0x22eE18aca7F3Ee920D01F25dA85840D12d98E8Ca",
      rewardContractInterface: "IBaseRewardPool",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["DAI"],
      rewardToken: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
    },
    {
      contractName: "ConvexUsdtZap",
      swapAddress: "0x52EA46506B9CC5Ef470C5bf89f17Dc28bB35D85C",
      swapInterface: "IDepositZap3",
      lpTokenAddress: "0x9fC689CCaDa600B6DF723D9E47D84d76664a1F23",
      rewardContractAddress: "0x8B55351ea358e5Eda371575B031ee24F462d503e",
      rewardContractInterface: "IBaseRewardPool",
      numberOfCoins: 3,
      whaleAddress: WHALE_POOLS["DAI"],
      useUnwrapped: true,
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

  ConvexZaps.forEach((curveConstants) => {
    const {
      contractName,
      swapAddress,
      swapInterface,
      lpTokenAddress,
      rewardContractAddress,
      rewardContractInterface,
      numberOfCoins,
      whaleAddress,
      rewardToken,
      useUnwrapped,
    } = curveConstants;

    describe(contractName, () => {
      let zap;
      let stableSwap;
      let lpToken;
      let rewardContract;

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
        rewardContract = await ethers.getContractAt(
          rewardContractInterface,
          rewardContractAddress
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
            const prevRewardContractBalance = await rewardContract.balanceOf(
              lpAccount.address
            );
            expect(prevRewardContractBalance).gt(0);

            await lpAccount
              .connect(lpSafe)
              .unwindStrategy(name, prevRewardContractBalance, underlyerIndex);

            const afterUnderlyerBalance = await underlyerToken.balanceOf(
              lpAccount.address
            );
            expect(afterUnderlyerBalance).gt(prevUnderlyerBalance);
            const afterLpBalance = await lpToken.balanceOf(lpAccount.address);
            expect(afterLpBalance).to.equal(0);
            const afterRewardContractBalance = await rewardContract.balanceOf(
              lpAccount.address
            );
            expect(afterRewardContractBalance).to.equal(0);
          });

          it("Get LP token Balance", async () => {
            const amounts = new Array(numberOfCoins).fill("0");
            // deposit 1% of the starting amount
            const underlyerAmount = tokenAmountToBigNumber(
              startingTokens * 0.01,
              await underlyerToken.decimals()
            );
            amounts[underlyerIndex] = underlyerAmount;

            const name = await zap.NAME();
            expect(await rewardContract.balanceOf(lpAccount.address)).to.equal(
              await lpAccount.getLpTokenBalance(name)
            );
            await lpAccount.connect(lpSafe).deployStrategy(name, amounts);
            expect(await rewardContract.balanceOf(lpAccount.address)).to.equal(
              await lpAccount.getLpTokenBalance(name)
            );
          });

          it("Claim", async () => {
            const crv = await ethers.getContractAt(
              "IDetailedERC20",
              CRV_ADDRESS
            );
            const cvx = await ethers.getContractAt(
              "IDetailedERC20",
              CVX_ADDRESS
            );
            const erc20s = await zap.erc20Allocations();

            // may remove CRV from erc20 allocations in the future, like with
            // other reward tokens, to avoid impacting TVL with slippage
            expect(erc20s).to.include(ethers.utils.getAddress(crv.address));

            expect(await crv.balanceOf(lpAccount.address)).to.equal(0);
            expect(await crv.balanceOf(treasurySafe.address)).to.equal(0);

            expect(await cvx.balanceOf(lpAccount.address)).to.equal(0);
            expect(await cvx.balanceOf(treasurySafe.address)).to.equal(0);

            if (typeof rewardToken !== "undefined") {
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

            console.debug(
              "periodFinish: %s",
              await rewardContract.periodFinish()
            );
            console.debug(
              "Deploy strategy time: %s",
              (await ethers.provider.getBlock()).timestamp
            );

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
              .registerMultipleRewardFees(
                [crv.address, cvx.address],
                [1500, 1500]
              );

            await lpAccount.connect(lpSafe).claim(name);

            expect(await crv.balanceOf(lpAccount.address)).to.be.gt(0);
            expect(await cvx.balanceOf(lpAccount.address)).to.be.gt(0);
            if (typeof rewardToken !== "undefined") {
              const token = await ethers.getContractAt(
                "IDetailedERC20",
                rewardToken
              );
              expect(await token.balanceOf(lpAccount.address)).to.be.gt(0);
            }

            // check fees taken out
            expect(await crv.balanceOf(treasurySafe.address)).to.be.gt(0);
            expect(await cvx.balanceOf(treasurySafe.address)).to.be.gt(0);
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

            const gaugeLpBalance = await rewardContract.balanceOf(
              lpAccount.address
            );
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
