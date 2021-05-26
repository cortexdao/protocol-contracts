const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const { BigNumber } = ethers;
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
} = require("../utils/helpers");
const AggregatorV3Interface = artifacts.require("AggregatorV3Interface");

describe.only("Contract: OracleAdapter", () => {
  // signers
  let deployer;
  let randomUser;

  // contract factories
  let OracleAdapter;

  // deployed contracts
  let oracleAdapter;

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
    [deployer, randomUser] = await ethers.getSigners();

    OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    const aggStalePeriod = 86400;
    const assets = [];
    const sources = [];
    const tvlAgg = await deployMockContract(
      deployer,
      AggregatorV3Interface.abi
    );

    oracleAdapter = await OracleAdapter.deploy(
      assets,
      sources,
      tvlAgg.address,
      aggStalePeriod
    );
    await oracleAdapter.deployed();
  });

  describe("Defaults", () => {
    it("Owner is set to deployer", async () => {
      expect(await oracleAdapter.owner()).to.equal(deployer.address);
    });
  });

  describe("Set TVL source", () => {
    it("Cannot set to non-contract address", async () => {
      await expect(
        oracleAdapter.connect(deployer).setTvlSource(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_SOURCE");
    });

    it("Owner can set", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      await oracleAdapter.connect(deployer).setTvlSource(dummyContract.address);
      expect(await oracleAdapter.tvlSource()).to.equal(dummyContract.address);
    });

    it("Revert when non-owner calls", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      await expect(
        oracleAdapter.connect(randomUser).setTvlSource(dummyContract.address)
      ).to.be.reverted;
    });
  });

  describe("Set asset sources", () => {
    it("Cannot set to non-contract address", async () => {
      const assets = [FAKE_ADDRESS];
      const sources = [ANOTHER_FAKE_ADDRESS];
      await expect(
        oracleAdapter.connect(deployer).setAssetSources(assets, sources)
      ).to.be.revertedWith("INVALID_SOURCE");
    });

    it("Owner can set", async () => {
      const assets = [FAKE_ADDRESS];
      const dummyContract = await deployMockContract(deployer, []);
      const sources = [dummyContract.address];

      await oracleAdapter.connect(deployer).setAssetSources(assets, sources);
      expect(await oracleAdapter.assetSources(FAKE_ADDRESS)).to.equal(
        dummyContract.address
      );
    });

    it("Revert when non-owner calls", async () => {
      const assets = [FAKE_ADDRESS];
      const dummyContract = await deployMockContract(deployer, []);
      const sources = [dummyContract.address];

      await expect(
        oracleAdapter.connect(randomUser).setAssetSources(assets, sources)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Set aggStalePeriod", () => {
    it("Cannot set to 0", async () => {
      await expect(
        oracleAdapter.connect(deployer).setAggStalePeriod(0)
      ).to.be.revertedWith("INVALID_STALE_PERIOD");
    });

    it("Owner can set", async () => {
      const period = 100;
      await oracleAdapter.connect(deployer).setAggStalePeriod(period);
      expect(await oracleAdapter.aggStalePeriod()).to.equal(period);
    });

    it("Revert when non-owner calls", async () => {
      await expect(
        oracleAdapter.connect(randomUser).setAggStalePeriod(14400)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
