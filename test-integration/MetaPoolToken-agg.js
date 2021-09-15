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

const link = (amount) => tokenAmountToBigNumber(amount, "18");
const usdc = (amount) => tokenAmountToBigNumber(amount, "6");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Contract: MetaPoolToken - TVL aggregator integration", () => {
  // accounts
  let deployer;
  let tvlManager;
  let lpAccount;
  let emergencySafe;
  let lpSafe;
  let adminSafe;
  let oracle;
  let randomUser;

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
    [
      deployer,
      tvlManager,
      lpAccount,
      emergencySafe,
      lpSafe,
      adminSafe,
      oracle,
      randomUser,
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

    addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    /* The address registry needs multiple addresses registered
     * to setup the roles for access control in the contract
     * constructors:
     *
     * MetaPoolToken
     * - lpSafe (contract role)
     * - emergencySafe (emergency role, default admin role)
     *
     * OracleAdapter
     * - tvlManager (contract role)
     * - mApt (contract role)
     * - adminSafe (admin role)
     * - emergencySafe (emergency role, default admin role)
     *
     * mApt is added below after deployment.
     */
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.tvlManagerAddress.returns(tvlManager.address);
    await addressRegistry.mock.lpAccountAddress.returns(lpAccount.address);

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const MetaPoolTokenProxy = await ethers.getContractFactory(
      "MetaPoolTokenProxy"
    );
    const MetaPoolToken = await ethers.getContractFactory("TestMetaPoolToken");

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

    await addressRegistry.mock.mAptAddress.returns(mApt.address);

    // oracle adapter needs to be deployed after mAPT due to dependency
    // on AddressRegistryV2.mAptAddress in constructor
    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    oracleAdapter = await OracleAdapter.deploy(
      addressRegistry.address,
      tvlAgg.address,
      [],
      [],
      86400,
      270
    );
    await oracleAdapter.deployed();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );
  });

  describe("getDeployedValue", async () => {
    it("Return 0 if zero mAPT supply", async () => {
      expect(await mApt.totalSupply()).to.equal("0");
      expect(await mApt.getDeployedValue(FAKE_ADDRESS)).to.equal("0");
    });

    it("Return 0 if zero mAPT balance", async () => {
      await mApt.testMint(FAKE_ADDRESS, tokenAmountToBigNumber(1000));
      expect(await mApt.getDeployedValue(ANOTHER_FAKE_ADDRESS)).to.equal("0");
    });

    it("Returns calculated value for non-zero mAPT balance", async () => {
      const tvl = tokenAmountToBigNumber("502300000", "8");
      const balance = tokenAmountToBigNumber("1000");
      const anotherBalance = tokenAmountToBigNumber("12345");
      const totalSupply = balance.add(anotherBalance);

      await mApt.testMint(FAKE_ADDRESS, balance);
      await mApt.testMint(ANOTHER_FAKE_ADDRESS, anotherBalance);
      await tvlAgg.connect(oracle).submit(1, tvl);

      const expectedEthValue = tvl.mul(balance).div(totalSupply);
      await oracleAdapter.connect(emergencySafe).emergencyUnlock();
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

      await mApt.testMint(randomUser.address, tokenAmountToBigNumber(100));

      // manually set TVL to zero
      await oracleAdapter.connect(emergencySafe).emergencySetTvl(0, 100);
      await oracleAdapter.connect(emergencySafe).emergencyUnlock();

      const mintAmount = await mApt.testCalculateDelta(
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

      const mintAmount = await mApt.testCalculateDelta(
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
      await mApt.testMint(randomUser.address, totalSupply);
      await tvlAgg.connect(oracle).submit(1, tvl);
      await oracleAdapter.connect(emergencySafe).emergencyUnlock();

      let mintAmount = await mApt.testCalculateDelta(
        usdcAmount,
        usdcUsdPrice,
        "6"
      );
      expect(mintAmount).to.be.equal(totalSupply);

      tvl = usdcUsdPrice.mul(usdcAmount.mul(2)).div(usdc(1));
      await tvlAgg.connect(oracle).submit(2, tvl);
      const expectedMintAmount = totalSupply.div(2);
      mintAmount = await mApt.testCalculateDelta(usdcAmount, usdcUsdPrice, "6");
      expect(mintAmount).to.be.equal(expectedMintAmount);
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
