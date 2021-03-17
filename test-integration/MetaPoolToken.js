const { expect } = require("chai");
const { ethers } = require("hardhat");
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
  acquireToken,
  console,
} = require("../utils/helpers");
const { BigNumber } = require("ethers");

const LINK_ADDRESS = "0x514910771AF9Ca656af840dff83E8264EcF986CA";
// Aave lending pool
// https://etherscan.io/address/0x3dfd23a6c5e8bbcfc9581d2e864a68feb6a076d3
const WHALE_ADDRESS = "0x3dfd23A6c5E8BbcFc9581d2E864a68feb6a076d3";

const dai = (amount) => tokenAmountToBigNumber(amount, "18");
const link = (amount) => tokenAmountToBigNumber(amount, "18");
const usdc = (amount) => tokenAmountToBigNumber(amount, "6");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Contract: MetaPoolToken", () => {
  // accounts
  let deployer;
  let manager;
  let randomUser;
  let anotherUser;
  let oracle;

  // contract factories
  let ProxyAdmin;
  let MetaPoolTokenProxy;
  let MetaPoolToken;

  // deployed contracts
  let proxyAdmin;
  let logic;
  let proxy;
  let mApt;

  let tvlAgg;
  let aggStalePeriod = 14400;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [
      deployer,
      manager,
      oracle,
      randomUser,
      anotherUser,
    ] = await ethers.getSigners();

    const paymentAmount = link("1");
    const maxSubmissionValue = tokenAmountToBigNumber("1", "20");
    const tvlAggConfig = {
      paymentAmount, // payment amount (price paid for each oracle submission, in wei)
      minSubmissionValue: 0,
      maxSubmissionValue,
      decimals: 8, // decimal offset for answer
      description: "TVL aggregator",
    };
    tvlAgg = await deployAggregator(
      tvlAggConfig,
      oracle.address,
      deployer.address, // oracle owner
      deployer.address // ETH funder
    );

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    MetaPoolTokenProxy = await ethers.getContractFactory("MetaPoolTokenProxy");
    MetaPoolToken = await ethers.getContractFactory("MetaPoolToken");

    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    logic = await MetaPoolToken.deploy();
    await logic.deployed();
    proxy = await MetaPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      tvlAgg.address,
      aggStalePeriod
    );
    await proxy.deployed();
    mApt = await MetaPoolToken.attach(proxy.address);

    await mApt.connect(deployer).setManagerAddress(manager.address);
  });

  describe("Minting and burning", async () => {
    it("Manager can mint", async () => {
      const mintAmount = tokenAmountToBigNumber("100");
      await expect(mApt.connect(manager).mint(randomUser.address, mintAmount))
        .to.not.be.reverted;
      expect(await mApt.balanceOf(randomUser.address)).to.equal(mintAmount);
    });

    it("Manager can burn", async () => {
      const mintAmount = tokenAmountToBigNumber("100");
      const burnAmount = tokenAmountToBigNumber("90");
      await mApt.connect(manager).mint(randomUser.address, mintAmount);

      await expect(mApt.connect(manager).burn(randomUser.address, burnAmount))
        .to.not.be.reverted;
      expect(await mApt.balanceOf(randomUser.address)).to.equal(
        mintAmount.sub(burnAmount)
      );
    });

    it("Revert when non-manager attempts to mint", async () => {
      await expect(
        mApt
          .connect(randomUser)
          .mint(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
      await expect(
        mApt
          .connect(deployer)
          .mint(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
    });

    it("Revert when non-manager attempts to burn", async () => {
      await expect(
        mApt
          .connect(randomUser)
          .burn(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
      await expect(
        mApt
          .connect(deployer)
          .mint(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
    });
  });

  describe("getDeployedValue", async () => {
    it("Return 0 if zero mAPT supply", async () => {
      expect(await mApt.totalSupply()).to.equal("0");
      expect(await mApt.getDeployedValue(FAKE_ADDRESS)).to.equal("0");
    });

    it("Return 0 if zero mAPT balance", async () => {
      await mApt
        .connect(manager)
        .mint(FAKE_ADDRESS, tokenAmountToBigNumber(1000));
      expect(await mApt.getDeployedValue(ANOTHER_FAKE_ADDRESS)).to.equal("0");
    });

    it("Returns calculated value for non-zero mAPT balance", async () => {
      const tvl = tokenAmountToBigNumber("502300000", "8");
      const balance = tokenAmountToBigNumber("1000");
      const anotherBalance = tokenAmountToBigNumber("12345");
      const totalSupply = balance.add(anotherBalance);

      await mApt.connect(manager).mint(FAKE_ADDRESS, balance);
      await mApt.connect(manager).mint(ANOTHER_FAKE_ADDRESS, anotherBalance);
      await tvlAgg.connect(oracle).submit(1, tvl);

      const expectedEthValue = tvl.mul(balance).div(totalSupply);
      expect(await mApt.getDeployedValue(FAKE_ADDRESS)).to.equal(
        expectedEthValue
      );
    });
  });

  describe("Calculations", async () => {
    it("Calculate mint amount with zero deployed TVL", async () => {
      const usdcUsdPrice = BigNumber.from("101260000");
      let usdcAmount = usdc(107);
      let usdcValue = usdcUsdPrice.mul(usdcAmount).div(usdc(1));

      await mApt
        .connect(manager)
        .mint(anotherUser.address, tokenAmountToBigNumber(100));

      await tvlAgg.connect(oracle).submit(1, 0);

      const mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcUsdPrice,
        "6"
      );
      const expectedMintAmount = usdcValue.mul(
        await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate mint amount with zero total supply", async () => {
      const usdcUsdPrice = BigNumber.from("101260000");
      let usdcAmount = usdc(107);
      let usdcValue = usdcUsdPrice.mul(usdcAmount).div(usdc(1));
      await tvlAgg.connect(oracle).submit(1, 1);

      const mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcUsdPrice,
        "6"
      );
      const expectedMintAmount = usdcValue.mul(
        await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate mint amount with non-zero total supply", async () => {
      const usdcUsdPrice = BigNumber.from("101260000");
      let usdcAmount = usdc(107);
      let tvl = usdcUsdPrice.mul(usdcAmount).div(usdc(1));

      const totalSupply = tokenAmountToBigNumber(21);
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);
      await tvlAgg.connect(oracle).submit(1, tvl);

      let mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcUsdPrice,
        "6"
      );
      expect(mintAmount).to.be.equal(totalSupply);

      tvl = usdcUsdPrice.mul(usdcAmount.mul(2)).div(usdc(1));
      await tvlAgg.connect(oracle).submit(2, tvl);
      const expectedMintAmount = totalSupply.div(2);
      mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcUsdPrice,
        "6"
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate pool amount with 1 pool", async () => {
      const usdcUsdPrice = BigNumber.from("101260000");
      const usdcAmount = usdc(107);
      const tvl = usdcUsdPrice.mul(usdcAmount).div(usdc(1));

      const totalSupply = tokenAmountToBigNumber(21);
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);
      await tvlAgg.connect(oracle).submit(1, tvl);

      let poolAmount = await mApt.calculatePoolAmount(
        totalSupply,
        usdcUsdPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(usdcAmount);

      const mAptAmount = tokenAmountToBigNumber(5);
      const expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      const expectedPoolAmount = expectedPoolValue
        .mul(usdc(1))
        .div(usdcUsdPrice);
      poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        usdcUsdPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);
    });

    it("Calculate pool amount with 2 pools", async () => {
      const usdcUsdPrice = BigNumber.from("101260000");
      const daiUsdPrice = BigNumber.from("103030000");
      const usdcAmount = usdc(107);
      const daiAmount = dai(10);
      const usdcValue = usdcUsdPrice.mul(usdcAmount).div(usdc(1));
      const daiValue = daiUsdPrice.mul(daiAmount).div(dai(1));
      const tvl = usdcValue.add(daiValue);

      const totalSupply = tokenAmountToBigNumber(21);
      let mAptAmount = tokenAmountToBigNumber(10);
      let expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      let expectedPoolAmount = expectedPoolValue.mul(usdc(1)).div(usdcUsdPrice);
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);
      await tvlAgg.connect(oracle).submit(1, tvl);

      let poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        usdcUsdPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);

      mAptAmount = totalSupply.sub(mAptAmount);
      expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      expectedPoolAmount = expectedPoolValue.mul(dai(1)).div(daiUsdPrice);
      poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        daiUsdPrice,
        "18"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);
    });
  });
});

async function deployAggregator(
  aggConfig,
  oracleAddress,
  oracleOwnerAddress,
  ethFunderAddress
) {
  const FluxAggregator = await ethers.getContractFactory("FluxAggregator");
  const agg = await FluxAggregator.deploy(
    LINK_ADDRESS,
    aggConfig.paymentAmount, // payment amount (price paid for each oracle submission, in wei)
    100000, // timeout before allowing oracle to skip round
    ZERO_ADDRESS, // validator address
    aggConfig.minSubmissionValue,
    aggConfig.maxSubmissionValue,
    aggConfig.decimals,
    aggConfig.description
  );
  await agg.deployed();

  // fund agg with LINK
  // aggregator must hold enough LINK for two rounds of submissions, i.e.
  // LINK reserve >= 2 * number of oracles * payment amount
  const linkToken = await ethers.getContractAt("IDetailedERC20", LINK_ADDRESS);
  const linkAmount = "100000";
  await acquireToken(
    WHALE_ADDRESS,
    agg.address,
    linkToken,
    linkAmount,
    ethFunderAddress
  );
  let trx = await agg.updateAvailableFunds();
  await trx.wait();

  // register oracle "node" with aggs
  trx = await agg.changeOracles(
    [], // oracles being removed
    [oracleAddress], // oracles being added
    [oracleOwnerAddress], // owners of oracles being added
    1, // min number of submissions for a round
    1, // max number of submissions for a round
    0 // number of rounds to wait before oracle can initiate round
  );
  await trx.wait();

  return agg;
}
