const hre = require("hardhat");
const { expect } = require("chai");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  acquireToken,
  impersonateAccount,
  forciblySendEth,
  FAKE_ADDRESS,
  bytes32,
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

const AAVE_ADDRESS = "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9";
const STAKED_AAVE_ADDRESS = "0x4da27a545c0c5B758a6BA100e3a049001de870f5";

describe.only("Aave Zaps", () => {
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

  const aTokenZaps = [
    {
      contractName: "AaveDaiZap",
      underlyerAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      aTokenAddress: "0x028171bCA77440897B824Ca71D1c56caC55b68A3",
      whaleAddress: WHALE_POOLS["DAI"],
    },
    {
      contractName: "AaveUsdcZap",
      underlyerAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      aTokenAddress: "0xBcca60bB61934080951369a648Fb03DF4F96263C",
      whaleAddress: WHALE_POOLS["USDC"],
    },
    {
      contractName: "AaveUsdtZap",
      underlyerAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      aTokenAddress: "0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811",
      whaleAddress: WHALE_POOLS["USDT"],
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

  aTokenZaps.forEach((params) => {
    const {
      contractName,
      underlyerAddress,
      aTokenAddress,
      whaleAddress,
    } = params;

    describe(contractName, () => {
      let zap;
      let underlyerToken;
      let aToken;
      let stkAaveToken;

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
        aToken = await ethers.getContractAt(
          "IDetailedERC20",
          aTokenAddress,
          adminSafe
        );
        stkAaveToken = await ethers.getContractAt(
          "IStakedAave",
          STAKED_AAVE_ADDRESS
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

      before("Fund Zap with Pool Underlyer", async () => {
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
          zap.address,
          underlyerToken,
          amount,
          deployer
        );
      });

      it("Deposit into pool and stake", async () => {
        const underlyerAmount = tokenAmountToBigNumber(
          1000,
          await underlyerToken.decimals()
        );
        const amounts = [underlyerAmount];

        expect(await aToken.balanceOf(zap.address)).to.equal(0);

        await zap.deployLiquidity(amounts);

        const aTokenBalance = await aToken.balanceOf(zap.address);
        expect(aTokenBalance).gt(0);

        const underlyerBalance = await underlyerToken.balanceOf(zap.address);

        await zap.unwindLiquidity(aTokenBalance, 0);

        expect(await underlyerToken.balanceOf(zap.address)).gt(
          underlyerBalance
        );
        expect(await aToken.balanceOf(zap.address)).lt(aTokenBalance);
      });

      it("Claim rewards", async () => {
        const underlyerAmount = tokenAmountToBigNumber(
          1000,
          await underlyerToken.decimals()
        );
        const amounts = [underlyerAmount];

        await zap.deployLiquidity(amounts);

        expect(await stkAaveToken.balanceOf(zap.address)).to.equal(0);

        await zap.claim();

        expect(await stkAaveToken.balanceOf(zap.address)).to.be.gt(0);
      });
    });
  });

  describe("StakedAaveZap", () => {
    let zap;
    let aaveToken;
    let stkAaveToken;
    let whaleAddress = WHALE_POOLS["AAVE"];

    before("Deploy Zap", async () => {
      const StakedAaveZap = await ethers.getContractFactory(
        "StakedAaveZap",
        adminSafe
      );
      zap = await StakedAaveZap.deploy();
    });

    before("Attach to Mainnet Curve contracts", async () => {
      aaveToken = await ethers.getContractAt("IDetailedERC20", AAVE_ADDRESS);
      stkAaveToken = await ethers.getContractAt(
        "IStakedAave",
        STAKED_AAVE_ADDRESS
      );
    });

    before("Fund Zap with AAVE", async () => {
      const amount = tokenAmountToBigNumber(100000, await aaveToken.decimals());

      await acquireToken(
        whaleAddress,
        zap.address,
        aaveToken,
        amount,
        deployer
      );
    });

    before("Can stake AAVE", async () => {
      const underlyerAmount = tokenAmountToBigNumber(
        1000,
        await aaveToken.decimals()
      );
      const amounts = [underlyerAmount];

      expect(await stkAaveToken.balanceOf(zap.address)).to.equal(0);

      await expect(zap.deployLiquidity(amounts)).to.not.be.reverted;

      expect(await stkAaveToken.balanceOf(zap.address)).to.be.gt(0);
    });

    it("Can claim rewards", async () => {
      const aaveBalance = await aaveToken.balanceOf(zap.address);

      await expect(zap.claim()).to.not.be.reverted;
      expect(await aaveToken.balanceOf(zap.address)).to.be.gt(aaveBalance);
    });

    it("Cannot redeem without cooldown", async () => {
      const stakedBalance = await stkAaveToken.balanceOf(zap.address);
      const txPromise = zap.unwindLiquidity(stakedBalance, 0);

      await expect(txPromise).to.not.be.reverted;

      const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
      await expect(txPromise)
        .to.emit(zap, "CooldownFromWithdrawFail")
        .withArgs(currentTimestamp);
    });

    it("Cannot redeem with active cooldown", async () => {
      const zapSigner = await impersonateAccount(zap.address);
      await forciblySendEth(
        zapSigner.address,
        tokenAmountToBigNumber(1),
        deployer.address
      );
      await stkAaveToken.connect(zapSigner).cooldown();

      const stakedBalance = await stkAaveToken.balanceOf(zap.address);
      await expect(zap.unwindLiquidity(stakedBalance, 0)).to.be.revertedWith(
        "INSUFFICIENT_COOLDOWN"
      );
    });

    it("cannot redeem beyond unstake window", async () => {
      const zapSigner = await impersonateAccount(zap.address);
      await forciblySendEth(
        zapSigner.address,
        tokenAmountToBigNumber(1),
        deployer.address
      );
      await stkAaveToken.connect(zapSigner).cooldown();

      const cooldownSeconds = 60 * 60 * 24 * 10;
      const unstakeWindowSeconds = 60 * 60 * 24 * 2;
      await hre.network.provider.send("evm_increaseTime", [
        cooldownSeconds + unstakeWindowSeconds,
      ]);
      await hre.network.provider.send("evm_mine");

      const stakedBalance = await stkAaveToken.balanceOf(zap.address);
      const txPromise = zap.unwindLiquidity(stakedBalance, 0);

      await expect(txPromise).to.not.be.reverted;

      const currentTimestamp = (await ethers.provider.getBlock()).timestamp;
      await expect(txPromise)
        .to.emit(zap, "CooldownFromWithdrawFail")
        .withArgs(currentTimestamp);
    });

    it("Can redeem within unstake window", async () => {
      const zapSigner = await impersonateAccount(zap.address);
      await forciblySendEth(
        zapSigner.address,
        tokenAmountToBigNumber(1),
        deployer.address
      );
      await stkAaveToken.connect(zapSigner).cooldown();

      const cooldownSeconds = 60 * 60 * 24 * 10;
      const unstakeWindowSeconds = 60 * 60 * 24 * 2;
      await hre.network.provider.send("evm_increaseTime", [
        cooldownSeconds + unstakeWindowSeconds - 1,
      ]);
      await hre.network.provider.send("evm_mine");

      const aaveBalance = await aaveToken.balanceOf(zap.address);
      const stakedBalance = await stkAaveToken.balanceOf(zap.address);

      const txPromise = zap.unwindLiquidity(stakedBalance, 0);
      await expect(txPromise).to.not.be.reverted;

      expect(await aaveToken.balanceOf(zap.address)).to.be.equal(
        aaveBalance.add(stakedBalance)
      );
      await expect(txPromise)
        .to.emit(zap, "WithdrawSucceeded")
        .withArgs(stakedBalance);
    });
  });
});
