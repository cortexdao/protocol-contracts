const { expect } = require("chai");
const { ethers, waffle, artifacts } = require("hardhat");
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const { deployMockContract } = waffle;
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
  let oracle;

  // deployed contracts
  let proxyAdmin;
  let logic;
  let proxy;
  let mApt;
  let oracleAdapter;
  let addressRegistry;

  let tvlAgg;

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
    [deployer, manager, oracle, randomUser] = await ethers.getSigners();

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

    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    oracleAdapter = await OracleAdapter.deploy([], [], tvlAgg.address, 86400);

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const MetaPoolTokenProxy = await ethers.getContractFactory(
      "MetaPoolTokenProxy"
    );
    const MetaPoolToken = await ethers.getContractFactory("MetaPoolToken");

    addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    await addressRegistry.mock.poolManagerAddress.returns(manager.address);
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    logic = await MetaPoolToken.deploy();
    await logic.deployed();
    proxy = await MetaPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      addressRegistry.address
    );
    await proxy.deployed();
    mApt = await MetaPoolToken.attach(proxy.address);
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
        .mint(randomUser.address, tokenAmountToBigNumber(100));

      // manually set TVL to zero
      await oracleAdapter.setLock(100);
      await oracleAdapter.setTvl(0, 100);
      await oracleAdapter.setLock(0);

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
      await mApt.connect(manager).mint(randomUser.address, totalSupply);
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
      await mApt.connect(manager).mint(randomUser.address, totalSupply);
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
      await mApt.connect(manager).mint(randomUser.address, totalSupply);
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
