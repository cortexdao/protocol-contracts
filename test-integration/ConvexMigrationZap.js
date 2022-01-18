const hre = require("hardhat");
const { expect } = require("chai");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
  FAKE_ADDRESS,
  impersonateAccount,
} = require("../utils/helpers");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

const pinnedBlock = 13818110;
const defaultPinnedBlock = hre.config.networks.hardhat.forking.blockNumber;
const forkingUrl = hre.config.networks.hardhat.forking.url;

const CurvePool = [
  {
    poolName: "3Pool",
    lpTokenAddress: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
    gaugeAddress: "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A",
    rewardContractAddress: "0x689440f2Ff927E1f24c72F1087E1FAF471eCe1c8",
    lpTokenWhaleAddress: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
    pid: 9,
  },
  {
    poolName: "Aave",
    lpTokenAddress: "0xFd2a8fA60Abd58Efe3EeE34dd494cD491dC14900",
    gaugeAddress: "0xd662908ADA2Ea1916B3318327A97eB18aD588b5d",
    rewardContractAddress: "0xE82c1eB4BC6F92f85BF7EB6421ab3b882C3F5a7B",
    lpTokenWhaleAddress: "0x03403154afc09ce8e44c3b185c82c6ad5f86b9ab",
    pid: 24,
  },
  {
    poolName: "Alusd",
    lpTokenAddress: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
    gaugeAddress: "0x9582C4ADACB3BCE56Fea3e590F05c3ca2fb9C477",
    rewardContractAddress: "0x02E2151D4F351881017ABdF2DD2b51150841d5B3",
    lpTokenWhaleAddress: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    pid: 36,
  },
  {
    poolName: "Compound",
    lpTokenAddress: "0x845838DF265Dcd2c412A1Dc9e959c7d08537f8a2",
    gaugeAddress: "0x7ca5b0a2910B33e9759DC7dDB0413949071D7575",
    rewardContractAddress: "0xf34DFF761145FF0B05e917811d488B441F33a968",
    lpTokenWhaleAddress: "0x629c759d1e83efbf63d84eb3868b564d9521c129",
    pid: 0,
  },
  {
    poolName: "Frax",
    lpTokenAddress: "0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B",
    gaugeAddress: "0x72E158d38dbd50A483501c24f792bDAAA3e7D55C",
    rewardContractAddress: "0xB900EF131301B307dB5eFcbed9DBb50A3e209B2e",
    lpTokenWhaleAddress: "0xB4AdA607B9d6b2c9Ee07A275e9616B84AC560139",
    pid: 32,
  },
  {
    poolName: "Lusd",
    lpTokenAddress: "0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA",
    gaugeAddress: "0x9B8519A9a00100720CCdC8a120fBeD319cA47a14",
    rewardContractAddress: "0x2ad92A7aE036a038ff02B96c88de868ddf3f8190",
    lpTokenWhaleAddress: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    pid: 33,
  },
  {
    poolName: "Musd",
    lpTokenAddress: "0x1AEf73d49Dedc4b1778d0706583995958Dc862e6",
    gaugeAddress: "0x5f626c30EC1215f4EdCc9982265E8b1F411D1352",
    rewardContractAddress: "0xDBFa6187C79f4fE4Cda20609E75760C5AaE88e52",
    lpTokenWhaleAddress: "0x0FCDAeDFb8A7DfDa2e9838564c5A1665d856AFDF",
    pid: 14,
  },
  {
    poolName: "Mim",
    lpTokenAddress: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
    gaugeAddress: "0xd8b712d29381748dB89c36BCa0138d7c75866ddF",
    rewardContractAddress: "0xFd5AbF66b003881b88567EB9Ed9c651F14Dc4771",
    lpTokenWhaleAddress: "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
    pid: 40,
  },
  {
    poolName: "Ousd",
    lpTokenAddress: "0x87650D7bbfC3A9F10587d7778206671719d9910D",
    gaugeAddress: "0x25f0cE4E2F8dbA112D9b115710AC297F816087CD",
    rewardContractAddress: "0x7D536a737C13561e0D2Decf1152a653B4e615158", // doesn't exist in default pinned block
    lpTokenWhaleAddress: "0x25f0cE4E2F8dbA112D9b115710AC297F816087CD",
    pid: 56,
  },
  {
    poolName: "Saave",
    lpTokenAddress: "0x02d341CcB60fAaf662bC0554d13778015d1b285C",
    gaugeAddress: "0x462253b8F74B72304c145DB0e4Eebd326B22ca39",
    rewardContractAddress: "0xF86AE6790654b70727dbE58BF1a863B270317fD0",
    lpTokenWhaleAddress: "0x462253b8F74B72304c145DB0e4Eebd326B22ca39",
    pid: 26,
  },
  {
    poolName: "Susdv2",
    lpTokenAddress: "0xC25a3A3b969415c80451098fa907EC722572917F",
    gaugeAddress: "0xA90996896660DEcC6E997655E065b23788857849",
    rewardContractAddress: "0x22eE18aca7F3Ee920D01F25dA85840D12d98E8Ca",
    lpTokenWhaleAddress: "0x1f9bB27d0C66fEB932f3F8B02620A128d072f3d8",
    pid: 4,
  },
  {
    poolName: "Usdt",
    lpTokenAddress: "0x9fC689CCaDa600B6DF723D9E47D84d76664a1F23",
    gaugeAddress: "0xBC89cd85491d81C6AD2954E6d0362Ee29fCa8F53",
    rewardContractAddress: "0x8B55351ea358e5Eda371575B031ee24F462d503e",
    lpTokenWhaleAddress: "0xa6CB47EBD1e8f9b60aF7033C5B075527409C7771",
    pid: 1,
  },
];

describe("Convex Migration Zap", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let adminSafe;
  let lpSafe;
  let lpAccountSigner;

  /* deployed contracts */
  let lpAccount;

  /* mocks */
  let addressRegistry;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Use newer pinned block for recently deployed contracts", async () => {
    await hre.network.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: forkingUrl,
          blockNumber: pinnedBlock,
        },
      },
    ]);
  });

  after("Reset pinned block to default", async () => {
    await hre.network.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: forkingUrl,
          blockNumber: defaultPinnedBlock,
        },
      },
    ]);
  });

  before("Setup mock Address Registry", async () => {
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
    await addressRegistry.mock.mAptAddress.returns(FAKE_ADDRESS); // not needed for anything
  });

  before("Setup mock Oracle Adapter", async () => {
    // oracle adapter is locked after unwinding
    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("OracleAdapter").abi
    );
    await oracleAdapter.mock.lock.returns();
    await oracleAdapter.mock.lockFor.returns();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );
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
    lpAccountSigner = await impersonateAccount(lpAccount.address);
  });

  CurvePool.forEach((curveConstants) => {
    const {
      poolName,
      lpTokenAddress,
      gaugeAddress,
      rewardContractAddress,
      lpTokenWhaleAddress,
      pid,
    } = curveConstants;

    describe(poolName, () => {
      let zap;
      let lpToken;

      let gauge;
      let rewardContract;

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
          "ConvexMigrationZap"
        );
        zap = await zapFactory.deploy();
      });

      before("Register zap with LP Account", async () => {
        await lpAccount.connect(adminSafe).registerZap(zap.address);
      });

      before("Attach to Mainnet Curve contracts", async () => {
        lpToken = await ethers.getContractAt("IDetailedERC20", lpTokenAddress);
        gauge = await ethers.getContractAt("ILiquidityGauge", gaugeAddress);
        rewardContract = await ethers.getContractAt(
          "IBaseRewardPool",
          rewardContractAddress
        );
      });

      before("Fund LP Account with Curve LP token", async () => {
        lpToken = await ethers.getContractAt("IDetailedERC20", lpTokenAddress);
        const amount = tokenAmountToBigNumber("1000", await lpToken.decimals());

        await acquireToken(
          lpTokenWhaleAddress,
          lpAccount.address,
          lpToken,
          amount,
          deployer
        );
      });

      before("Stake LP tokens into Curve gauge", async () => {
        const lpBalance = await lpToken.balanceOf(lpAccount.address);
        await lpToken
          .connect(lpAccountSigner)
          .approve(gauge.address, lpBalance);
        await gauge.connect(lpAccountSigner)["deposit(uint256)"](lpBalance);
      });

      it("Unwind from Curve gauge and restake into Convex", async () => {
        const prevLpBalance = await lpToken.balanceOf(lpAccount.address);
        expect(prevLpBalance).to.equal(0);
        const prevGaugeLpBalance = await gauge.balanceOf(lpAccount.address);
        expect(prevGaugeLpBalance).gt(0);
        const prevRewardContractLpBalance = await rewardContract.balanceOf(
          lpAccount.address
        );
        expect(prevRewardContractLpBalance).to.equal(0);

        const name = await zap.NAME();
        await lpAccount
          .connect(lpSafe)
          .unwindStrategy(name, prevGaugeLpBalance, pid);

        const afterLpBalance = await lpToken.balanceOf(lpAccount.address);
        expect(afterLpBalance).to.equal(0);
        const afterGaugeLpBalance = await gauge.balanceOf(lpAccount.address);
        expect(afterGaugeLpBalance).to.equal(0);
        const afterRewardContractLpBalance = await rewardContract.balanceOf(
          lpAccount.address
        );
        expect(afterRewardContractLpBalance).to.equal(prevGaugeLpBalance);
      });
    });
  });
});
