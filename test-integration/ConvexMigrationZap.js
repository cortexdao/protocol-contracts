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

const CurvePool = [
  {
    poolName: "3Pool",
    lpTokenAddress: "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490",
    gaugeAddress: "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A",
    rewardContractAddress: "0x689440f2Ff927E1f24c72F1087E1FAF471eCe1c8",
    lpTokenWhaleAddress: "0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c",
    pid: 9,
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
        console.log("LP Balance: %s", lpBalance);
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
