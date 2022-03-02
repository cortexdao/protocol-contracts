const hre = require("hardhat");
const { expect } = require("chai");
const { ethers, waffle, artifacts } = hre;
const _ = require("lodash");
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

describe("LP Account integration: batch claiming", () => {
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

  let zaps = [];
  let stableswaps = [];
  let rewardContracts = [];

  let crv;
  let cvx;
  let rewardToken_0;
  let rewardToken_1;

  let underlyerToken;
  const underlyerIndex = 0;
  const startingTokens = 100000;

  // use EVM snapshots for test isolation
  let snapshotId;

  const zapData = [
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
      contractName: "ConvexMimZap",
      swapAddress: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
      swapInterface: "IMetaPool",
      lpTokenAddress: "0x5a6A4D54456819380173272A5E8E9B9904BdF41B",
      rewardContractAddress: "0xFd5AbF66b003881b88567EB9Ed9c651F14Dc4771",
      rewardContractInterface: "IBaseRewardPool",
      numberOfCoins: 4,
      whaleAddress: WHALE_POOLS["MIM"],
      rewardToken: "0x090185f2135308BaD17527004364eBcC2D37e5F6",
    },
  ];

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

  before("Deploy zaps", async () => {
    for (const data of zapData) {
      const zapFactory = await ethers.getContractFactory(
        data.contractName,
        adminSafe
      );
      const zap = await zapFactory.deploy();
      zaps.push(zap);
    }
  });

  before("Register zaps with LP Account", async () => {
    for (const zap of zaps) {
      await lpAccount.connect(adminSafe).registerZap(zap.address);
    }
  });

  before("Attach to Mainnet Curve contracts", async () => {
    for (const data of zapData) {
      const stableSwap = await ethers.getContractAt(
        data.swapInterface,
        data.swapAddress,
        adminSafe
      );
      const rewardContract = await ethers.getContractAt(
        data.rewardContractInterface,
        data.rewardContractAddress
      );

      stableswaps.push(stableSwap);
      rewardContracts.push(rewardContract);
    }
  });

  before("Register allocations with TVL Manager", async () => {
    // 3pool allocation needed for Curve metapool allocations
    const Curve3poolAllocation = await ethers.getContractFactory(
      "Curve3poolAllocation"
    );
    const curve3poolAllocation = await Curve3poolAllocation.deploy();

    for (const [zap, data] of _.zip(zaps, zapData)) {
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
        let allocation;
        if (
          allocationContractName.startsWith("Curve") &&
          data.swapInterface == "IMetaPool"
        ) {
          allocation = await allocationFactory.deploy(
            curve3poolAllocation.address
          );
        } else {
          // Convex metapool allocations have zero constructor args
          allocation = await allocationFactory.deploy();
        }
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(allocation.address);
      }
    }
  });

  before("Register tokens with ERC20 Allocation", async () => {
    for (const zap of zaps) {
      const erc20s = await zap.erc20Allocations();
      for (const token of erc20s) {
        await erc20Allocation
          .connect(adminSafe)
          ["registerErc20Token(address)"](token);
      }
    }
  });

  before("Fund LP Account with pool underlyer", async () => {
    for (const [stableSwap, data] of _.zip(stableswaps, zapData)) {
      let underlyerAddress;
      if (data.useUnwrapped) {
        underlyerAddress = await stableSwap.underlying_coins(underlyerIndex);
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
        data.whaleAddress,
        lpAccount.address,
        underlyerToken,
        amount,
        deployer
      );
    }
  });

  before("Setup reward tokens", async () => {
    crv = await ethers.getContractAt("IDetailedERC20", CRV_ADDRESS);
    cvx = await ethers.getContractAt("IDetailedERC20", CVX_ADDRESS);
    const erc20s_0 = await zaps[0].erc20Allocations();
    const erc20s_1 = await zaps[1].erc20Allocations();

    // may remove CRV from erc20 allocations in the future, like with
    // other reward tokens, to avoid impacting TVL with slippage
    expect(erc20s_0).to.include(ethers.utils.getAddress(crv.address));
    expect(erc20s_1).to.include(ethers.utils.getAddress(crv.address));

    rewardToken_0 = await ethers.getContractAt(
      "IDetailedERC20",
      zapData[0].rewardToken
    );
    rewardToken_1 = await ethers.getContractAt(
      "IDetailedERC20",
      zapData[1].rewardToken
    );
  });

  before("Deploy into pools", async () => {
    const amounts = new Array(4).fill("0");
    // deposit 1% of the starting amount
    const underlyerAmount = tokenAmountToBigNumber(
      startingTokens * 0.01,
      await underlyerToken.decimals()
    );
    amounts[underlyerIndex] = underlyerAmount;

    const name_0 = await zaps[0].NAME();
    const name_1 = await zaps[1].NAME();
    await lpAccount.connect(lpSafe).deployStrategy(name_0, amounts);
    await lpAccount.connect(lpSafe).deployStrategy(name_1, amounts);

    // allows rewards to accumulate:
    // CRV rewards accumulate within a block, but other rewards, like
    // staked Aave, require longer
    const oneDayInSeconds = 60 * 60 * 24;
    await hre.network.provider.send("evm_increaseTime", [oneDayInSeconds]);
    await hre.network.provider.send("evm_mine");
  });

  it("claim multiple zaps at once (CRV and CVX registered)", async () => {
    expect(await crv.balanceOf(lpAccount.address)).to.equal(0);
    expect(await cvx.balanceOf(lpAccount.address)).to.equal(0);
    expect(await rewardToken_0.balanceOf(lpAccount.address)).to.equal(0);
    expect(await rewardToken_1.balanceOf(lpAccount.address)).to.equal(0);

    expect(await crv.balanceOf(treasurySafe.address)).to.equal(0);
    expect(await cvx.balanceOf(treasurySafe.address)).to.equal(0);

    // setup reward tokens for fees
    await lpAccount
      .connect(adminSafe)
      .registerMultipleRewardFees([crv.address, cvx.address], [1500, 1500]);

    const name_0 = await zaps[0].NAME();
    const name_1 = await zaps[1].NAME();
    await lpAccount.connect(lpSafe).claim([name_0, name_1]);

    expect(await crv.balanceOf(lpAccount.address)).to.be.gt(0);
    expect(await cvx.balanceOf(lpAccount.address)).to.be.gt(0);
    expect(await rewardToken_0.balanceOf(lpAccount.address)).to.be.gt(0);
    expect(await rewardToken_1.balanceOf(lpAccount.address)).to.be.gt(0);

    // check fees taken out
    expect(await crv.balanceOf(treasurySafe.address)).to.be.gt(0);
    expect(await cvx.balanceOf(treasurySafe.address)).to.be.gt(0);
  });

  it("claim multiple zaps at once (neither CRV nor CVX registered)", async () => {
    expect(await crv.balanceOf(lpAccount.address)).to.equal(0);
    expect(await cvx.balanceOf(lpAccount.address)).to.equal(0);
    expect(await rewardToken_0.balanceOf(lpAccount.address)).to.equal(0);
    expect(await rewardToken_1.balanceOf(lpAccount.address)).to.equal(0);

    expect(await crv.balanceOf(treasurySafe.address)).to.equal(0);
    expect(await cvx.balanceOf(treasurySafe.address)).to.equal(0);

    const name_0 = await zaps[0].NAME();
    const name_1 = await zaps[1].NAME();
    await lpAccount.connect(lpSafe).claim([name_0, name_1]);

    expect(await crv.balanceOf(lpAccount.address)).to.be.gt(0);
    expect(await cvx.balanceOf(lpAccount.address)).to.be.gt(0);
    expect(await rewardToken_0.balanceOf(lpAccount.address)).to.be.gt(0);
    expect(await rewardToken_1.balanceOf(lpAccount.address)).to.be.gt(0);

    // check fees taken out
    expect(await crv.balanceOf(treasurySafe.address)).to.equal(0);
    expect(await cvx.balanceOf(treasurySafe.address)).to.equal(0);
  });

  it("claim multiple zaps at once (only CVX registered)", async () => {
    expect(await crv.balanceOf(lpAccount.address)).to.equal(0);
    expect(await cvx.balanceOf(lpAccount.address)).to.equal(0);
    expect(await rewardToken_0.balanceOf(lpAccount.address)).to.equal(0);
    expect(await rewardToken_1.balanceOf(lpAccount.address)).to.equal(0);

    expect(await crv.balanceOf(treasurySafe.address)).to.equal(0);
    expect(await cvx.balanceOf(treasurySafe.address)).to.equal(0);

    // setup reward tokens for fees
    await lpAccount
      .connect(adminSafe)
      .registerMultipleRewardFees([cvx.address], [1500]);

    const name_0 = await zaps[0].NAME();
    const name_1 = await zaps[1].NAME();
    await lpAccount.connect(lpSafe).claim([name_0, name_1]);

    expect(await crv.balanceOf(lpAccount.address)).to.be.gt(0);
    expect(await cvx.balanceOf(lpAccount.address)).to.be.gt(0);
    expect(await rewardToken_0.balanceOf(lpAccount.address)).to.be.gt(0);
    expect(await rewardToken_1.balanceOf(lpAccount.address)).to.be.gt(0);

    // check fees taken out
    expect(await crv.balanceOf(treasurySafe.address)).to.equal(0);
    expect(await cvx.balanceOf(treasurySafe.address)).to.be.gt(0);
  });
});
