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
  let lpSafe;
  let mApt;

  /* contract factories */
  let TvlManager;

  /* deployed contracts */
  let tvlManager;

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

  before(async () => {
    [deployer, emergencySafe, lpSafe, mApt] = await ethers.getSigners();

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
     * - lpSafe (LP role)
     * - mApt (contract role)
     */
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.mAptAddress.returns(mApt.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);

    const Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    const erc20Allocation = await Erc20Allocation.deploy(
      addressRegistry.address
    );

    /* These registered addresses are setup for roles in the
     * constructor for TvlManager
     * - lpSafe (LP role)
     * - emergencySafe (emergency role, default admin role)
     */
    TvlManager = await ethers.getContractFactory("TvlManager");
    tvlManager = await TvlManager.deploy(addressRegistry.address);
    await tvlManager
      .connect(lpSafe)
      .registerAssetAllocation(erc20Allocation.address);
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

      before("Deploy Zap", async () => {
        const zapFactory = await ethers.getContractFactory(
          contractName,
          lpSafe
        );
        zap = await zapFactory.deploy();
      });

      before("Attach to Mainnet Curve contracts", async () => {
        aToken = await ethers.getContractAt(
          "IDetailedERC20",
          aTokenAddress,
          lpSafe
        );
        stkAaveToken = await ethers.getContractAt(
          "IStakedAave",
          STAKED_AAVE_ADDRESS
        );
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
        lpSafe
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
