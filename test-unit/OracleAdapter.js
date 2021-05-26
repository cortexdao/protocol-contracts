const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const { BigNumber } = ethers;
const timeMachine = require("ganache-time-traveler");
const { tokenAmountToBigNumber } = require("../utils/helpers");

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
    const tvlAgg = await deployMockContract(deployer, []);

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
});
