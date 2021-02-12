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

const ether = (amount) => tokenAmountToBigNumber(amount, "18");
const dai = (amount) => tokenAmountToBigNumber(amount, "18");
const link = (amount) => tokenAmountToBigNumber(amount, "18");
const usdc = (amount) => tokenAmountToBigNumber(amount, "6");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Contract: APYMetaPoolToken", () => {
  // accounts
  let deployer;
  let manager;
  let randomUser;
  let anotherUser;
  let oracle;

  // contract factories
  let ProxyAdmin;
  let APYMetaPoolTokenProxy;
  let APYMetaPoolToken;

  // deployed contracts
  let proxyAdmin;
  let logic;
  let proxy;
  let mApt;

  let tvlAgg;
  let ethUsdAgg;
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
    const ethUsdAggConfig = {
      paymentAmount, // payment amount (price paid for each oracle submission, in wei)
      minSubmissionValue: 0,
      maxSubmissionValue,
      decimals: 8, // decimal offset for answer
      description: "ETH-USD aggregator",
    };
    tvlAgg = await deployAggregator(
      tvlAggConfig,
      oracle.address,
      deployer.address, // oracle owner
      deployer.address // ETH funder
    );
    ethUsdAgg = await deployAggregator(
      ethUsdAggConfig,
      oracle.address,
      deployer.address, // oracle owner
      deployer.address // ETH funder
    );

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    APYMetaPoolTokenProxy = await ethers.getContractFactory(
      "APYMetaPoolTokenProxy"
    );
    APYMetaPoolToken = await ethers.getContractFactory("APYMetaPoolToken");

    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    logic = await APYMetaPoolToken.deploy();
    await logic.deployed();
    proxy = await APYMetaPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      tvlAgg.address,
      ethUsdAgg.address,
      aggStalePeriod
    );
    await proxy.deployed();
    mApt = await APYMetaPoolToken.attach(proxy.address);

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

  describe("getDeployedEthValue", async () => {
    it("Return 0 if zero mAPT supply", async () => {
      expect(await mApt.totalSupply()).to.equal("0");
      expect(await mApt.getDeployedEthValue(FAKE_ADDRESS)).to.equal("0");
    });

    it("Return 0 if zero mAPT balance", async () => {
      await mApt
        .connect(manager)
        .mint(FAKE_ADDRESS, tokenAmountToBigNumber(1000));
      expect(await mApt.getDeployedEthValue(ANOTHER_FAKE_ADDRESS)).to.equal(
        "0"
      );
    });

    it("Returns calculated value for non-zero mAPT balance", async () => {
      const tvl = tokenAmountToBigNumber("502300000", "8");
      const balance = tokenAmountToBigNumber("1000");
      const anotherBalance = tokenAmountToBigNumber("12345");
      const totalSupply = balance.add(anotherBalance);

      await tvlAgg.connect(oracle).submit(1, tvl);
      await ethUsdAgg.connect(oracle).submit(1, ether(1));
      await mApt.connect(manager).mint(FAKE_ADDRESS, balance);
      await mApt.connect(manager).mint(ANOTHER_FAKE_ADDRESS, anotherBalance);

      const expectedEthValue = tvl.mul(balance).div(totalSupply);
      expect(await mApt.getDeployedEthValue(FAKE_ADDRESS)).to.equal(
        expectedEthValue
      );
    });
  });

  describe("Calculations", async () => {
    it("Calculate mint amount with zero deployed TVL", async () => {
      await tvlAgg.connect(oracle).submit(1, 0);
      await ethUsdAgg.connect(oracle).submit(1, 1);

      const usdcEthPrice = BigNumber.from("1602950450000000");
      let usdcAmount = usdc(107);
      let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));

      await mApt
        .connect(manager)
        .mint(anotherUser.address, tokenAmountToBigNumber(100));

      const mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      const expectedMintAmount = usdcValue.mul(
        await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate mint amount with zero total supply", async () => {
      const usdcEthPrice = BigNumber.from("1602950450000000");
      let usdcAmount = usdc(107);
      let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      // await mApt.setTVL(1);
      await tvlAgg.connect(oracle).submit(1, 1);
      await ethUsdAgg.connect(oracle).submit(1, 1);

      const mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      const expectedMintAmount = usdcValue.mul(
        await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate mint amount with non-zero total supply", async () => {
      const usdcEthPrice = BigNumber.from("1602950450000000");
      let usdcAmount = usdc(107);
      let tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await tvlAgg.connect(oracle).submit(1, tvl);
      await ethUsdAgg.connect(oracle).submit(1, ether(1));

      const totalSupply = tokenAmountToBigNumber(21);
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);

      let mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      expect(mintAmount).to.be.equal(totalSupply);

      tvl = usdcEthPrice.mul(usdcAmount.mul(2)).div(usdc(1));
      await tvlAgg.connect(oracle).submit(2, tvl);
      await ethUsdAgg.connect(oracle).submit(2, ether(1));
      const expectedMintAmount = totalSupply.div(2);
      mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate pool amount with 1 pool", async () => {
      const usdcEthPrice = BigNumber.from("1602950450000000");
      const usdcAmount = usdc(107);
      const tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await tvlAgg.connect(oracle).submit(1, tvl);
      await ethUsdAgg.connect(oracle).submit(1, ether(1));

      const totalSupply = tokenAmountToBigNumber(21);
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);

      let poolAmount = await mApt.calculatePoolAmount(
        totalSupply,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(usdcAmount);

      const mAptAmount = tokenAmountToBigNumber(5);
      const expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      const expectedPoolAmount = expectedPoolValue
        .mul(usdc(1))
        .div(usdcEthPrice);
      poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);
    });

    it("Calculate pool amount with 2 pools", async () => {
      const usdcEthPrice = BigNumber.from("1602950450000000");
      const daiEthPrice = BigNumber.from("1603100000000000");
      const usdcAmount = usdc(107);
      const daiAmount = dai(10);
      const usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      const daiValue = daiEthPrice.mul(daiAmount).div(dai(1));
      const tvl = usdcValue.add(daiValue);
      await tvlAgg.connect(oracle).submit(1, tvl);
      await ethUsdAgg.connect(oracle).submit(1, ether(1));

      const totalSupply = tokenAmountToBigNumber(21);
      let mAptAmount = tokenAmountToBigNumber(10);
      let expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      let expectedPoolAmount = expectedPoolValue.mul(usdc(1)).div(usdcEthPrice);
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);
      let poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);

      mAptAmount = totalSupply.sub(mAptAmount);
      expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      expectedPoolAmount = expectedPoolValue.mul(dai(1)).div(daiEthPrice);
      poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        daiEthPrice,
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
