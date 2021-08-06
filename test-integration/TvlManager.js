const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const {
  console,
  tokenAmountToBigNumber,
  getStablecoinAddress,
  acquireToken,
  MAX_UINT256,
  bytes32,
} = require("../utils/helpers");
const { STABLECOIN_POOLS } = require("../utils/constants");

const dai = (amount) => tokenAmountToBigNumber(amount, "18");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

// Curve 3Pool Mainnet addresses:
const STABLE_SWAP_ADDRESS = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
const LP_TOKEN_ADDRESS = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const LIQUIDITY_GAUGE_ADDRESS = "0xbFcF63294aD7105dEa65aA58F8AE5BE2D9d0952A";

async function sendErc20Tokens(symbol, amount, recipient, ethFunder) {
  if (!["DAI", "USDC", "USDT"].includes(symbol.toUpperCase())) {
    throw Error("Unsupported ERC20 token.");
  }
  const tokenAddress = getStablecoinAddress(symbol, "MAINNET");
  const token = await ethers.getContractAt("ERC20", tokenAddress);
  await acquireToken(
    STABLECOIN_POOLS[symbol],
    recipient,
    token,
    amount,
    ethFunder
  );
}

describe("Contract: TvlManager", () => {
  /* signers */
  let deployer;
  let emergencySafe;
  let lpSafe;
  let poolManager;

  /* contract factories */
  let TvlManager;

  /* deployed contracts */
  let tvlManager;
  let erc20Allocation;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [deployer, emergencySafe, lpSafe, poolManager] = await ethers.getSigners();

    const addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    /* These registered addresses are setup for roles in the
     * constructor for TvlManager
     * TvlManager
     * - poolManager (contract role)
     * - lpSafe (LP role)
     * - emergencySafe (emergency role, default admin role)
     */
    await addressRegistry.mock.poolManagerAddress.returns(poolManager.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    const oracleAdapter = await deployMockContract(
      deployer,
      artifacts.require("IOracleAdapter").abi
    );
    await oracleAdapter.mock.lock.returns();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    const Erc20Allocation = await ethers.getContractFactory(
      "Erc20Allocation",
      lpSafe
    );
    erc20Allocation = await Erc20Allocation.deploy(addressRegistry.address);

    TvlManager = await ethers.getContractFactory("TvlManager");
    tvlManager = await TvlManager.deploy(
      addressRegistry.address,
      erc20Allocation.address
    );
  });

  describe("ERC20 allocation", () => {
    describe("TVL Manager returns registered ERC20 info", () => {
      it("registerErc20Token(address)", async () => {
        const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
        await erc20Allocation["registerErc20Token(address)"](usdcAddress);
        expect(await erc20Allocation.tokens()).to.deep.equal([
          [usdcAddress, "USDC", 6],
        ]);

        const allocationId = tvlManager.getAssetAllocationId(
          erc20Allocation.address,
          0
        );
        expect(await tvlManager.symbolOf(allocationId)).to.equal("USDC");
        expect(await tvlManager.decimalsOf(allocationId)).to.equal(6);

        expect(await tvlManager.balanceOf(allocationId)).to.equal(0);
        const amount = tokenAmountToBigNumber(100, 6);
        await sendErc20Tokens("USDC", amount, lpSafe, deployer);
        expect(await tvlManager.balanceOf(allocationId)).to.equal(amount);
      });

      it("registerErc20Token(address,string)", async () => {
        const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
        await erc20Allocation["registerErc20Token(address,string)"](
          usdcAddress,
          "USDC"
        );
        expect(await erc20Allocation.tokens()).to.deep.equal([
          [usdcAddress, "USDC", 6],
        ]);

        const allocationId = tvlManager.getAssetAllocationId(
          erc20Allocation.address,
          0
        );
        expect(await tvlManager.symbolOf(allocationId)).to.equal("USDC");
        expect(await tvlManager.decimalsOf(allocationId)).to.equal(6);

        expect(await tvlManager.balanceOf(allocationId)).to.equal(0);
        const amount = tokenAmountToBigNumber(100, 6);
        await sendErc20Tokens("USDC", amount, lpSafe, deployer);
        expect(await tvlManager.balanceOf(allocationId)).to.equal(amount);
      });

      it("registerErc20Token(address,string,uint8)", async () => {
        const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
        await erc20Allocation["registerErc20Token(address,string,uint8)"](
          usdcAddress,
          "USDC",
          6
        );
        expect(await erc20Allocation.tokens()).to.deep.equal([
          [usdcAddress, "USDC", 6],
        ]);

        const allocationId = tvlManager.getAssetAllocationId(
          erc20Allocation.address,
          0
        );
        expect(await tvlManager.symbolOf(allocationId)).to.equal("USDC");
        expect(await tvlManager.decimalsOf(allocationId)).to.equal(6);

        expect(await tvlManager.balanceOf(allocationId)).to.equal(0);
        const amount = tokenAmountToBigNumber(100, 6);
        await sendErc20Tokens("USDC", amount, lpSafe, deployer);
        expect(await tvlManager.balanceOf(allocationId)).to.equal(amount);
      });
    });

    describe("TVL Manager reflects ERC20 removal", () => {
      it("removeErc20Token", async () => {
        const usdcAddress = getStablecoinAddress("USDC", "MAINNET");
        const daiAddress = getStablecoinAddress("DAI", "MAINNET");

        await erc20Allocation["registerErc20Token(address)"](usdcAddress);
        await erc20Allocation["registerErc20Token(address)"](daiAddress);
        expect(await erc20Allocation.tokens()).to.have.lengthOf(2);

        const usdcId = tvlManager.getAssetAllocationId(
          erc20Allocation.address,
          0
        );
        expect(await tvlManager.symbolOf(usdcId)).to.equal("USDC");
        const daiId = tvlManager.getAssetAllocationId(
          erc20Allocation.address,
          1
        );
        expect(await tvlManager.symbolOf(daiId)).to.equal("DAI");

        await erc20Allocation.removeErc20Token(usdcAddress);
        expect(await erc20Allocation.tokens()).to.have.lengthOf(1);

        const allocationId = tvlManager.getAssetAllocationId(
          erc20Allocation.address,
          0
        );
        expect(await tvlManager.symbolOf(allocationId)).to.equal("DAI");
      });
    });
  });

  describe("Curve allocation", () => {
    let CurveAllocation;
    let curve;

    // Curve 3Pool
    let lpToken;
    let stableSwap;
    let gauge;
    let daiToken;
    let lookupId;

    const daiIndex = 0;

    before("Deploy and attach to contracts", async () => {
      CurveAllocation = await ethers.getContractFactory("Curve3PoolAllocation");
      curve = await CurveAllocation.deploy();
      await curve.deployed();

      lpToken = await ethers.getContractAt(
        "IDetailedERC20UpgradeSafe",
        LP_TOKEN_ADDRESS
      );
      stableSwap = await ethers.getContractAt(
        "IStableSwap",
        STABLE_SWAP_ADDRESS
      );
      gauge = await ethers.getContractAt(
        "ILiquidityGauge",
        LIQUIDITY_GAUGE_ADDRESS
      );
    });

    before("Prepare account 0 with DAI funds", async () => {
      const daiAddress = getStablecoinAddress("DAI", "MAINNET");
      daiToken = await ethers.getContractAt(
        "IDetailedERC20UpgradeSafe",
        daiAddress
      );

      const amount = dai(500000);
      const sender = STABLECOIN_POOLS["DAI"];
      await acquireToken(sender, lpSafe, daiToken, amount, deployer);
    });

    before("Register asset allocation", async () => {
      await tvlManager.connect(lpSafe).registerAssetAllocation(curve.address);
      lookupId = await tvlManager.getAssetAllocationId(curve.address, 0);
    });

    it("Get underlyer balance from account holding", async () => {
      const daiAmount = dai("1000");
      const minAmount = 0;
      await daiToken.connect(lpSafe).approve(stableSwap.address, MAX_UINT256);
      await stableSwap
        .connect(lpSafe)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      const strategyLpBalance = await lpToken.balanceOf(lpSafe.address);
      const poolBalance = await stableSwap.balances(daiIndex);
      const lpTotalSupply = await lpToken.totalSupply();

      const expectedBalance = strategyLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      expect(await tvlManager.balanceOf(lookupId)).to.equal(expectedBalance);
    });

    it("Get underlyer balance from gauge holding", async () => {
      const daiAmount = dai("1000");
      const minAmount = 0;
      await daiToken.connect(lpSafe).approve(stableSwap.address, MAX_UINT256);
      await stableSwap
        .connect(lpSafe)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
      const strategyLpBalance = await lpToken.balanceOf(lpSafe.address);
      await gauge.connect(lpSafe)["deposit(uint256)"](strategyLpBalance);
      expect(await lpToken.balanceOf(lpSafe.address)).to.equal(0);
      const gaugeLpBalance = await gauge.balanceOf(lpSafe.address);
      expect(gaugeLpBalance).to.be.gt(0);

      const poolBalance = await stableSwap.balances(daiIndex);
      const lpTotalSupply = await lpToken.totalSupply();

      const expectedBalance = gaugeLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      expect(await tvlManager.balanceOf(lookupId)).to.equal(expectedBalance);
    });

    it("Get underlyer balance from combined holdings", async () => {
      const daiAmount = dai("1000");
      const minAmount = 0;
      await daiToken.connect(lpSafe).approve(stableSwap.address, MAX_UINT256);
      await stableSwap
        .connect(lpSafe)
        .add_liquidity([daiAmount, "0", "0"], minAmount);

      // split LP tokens between strategy and gauge
      const totalLPBalance = await lpToken.balanceOf(lpSafe.address);
      const strategyLpBalance = totalLPBalance.div(3);
      const gaugeLpBalance = totalLPBalance.sub(strategyLpBalance);
      expect(gaugeLpBalance).to.be.gt(0);
      expect(strategyLpBalance).to.be.gt(0);

      await lpToken.connect(lpSafe).approve(gauge.address, MAX_UINT256);
      await gauge.connect(lpSafe)["deposit(uint256)"](gaugeLpBalance);

      expect(await lpToken.balanceOf(lpSafe.address)).to.equal(
        strategyLpBalance
      );
      expect(await gauge.balanceOf(lpSafe.address)).to.equal(gaugeLpBalance);

      const poolBalance = await stableSwap.balances(daiIndex);
      const lpTotalSupply = await lpToken.totalSupply();

      const expectedBalance = totalLPBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      expect(await tvlManager.balanceOf(lookupId)).to.equal(expectedBalance);
    });
  });
});
