const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("../utils/helpers");

describe.only("VotingEscrow deployment", () => {
  // signers
  let deployer;

  // contract factories
  let VotingEscrow;

  // deployed contracts
  let veCrv;

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
    [deployer] = await ethers.getSigners();
  });

  it("Can deploy VotingEscrow", async () => {
    const erc20Mock = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IDetailedERC20").abi
    );
    await erc20Mock.mock.decimals.returns(9);

    VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    veCrv = await expect(
      VotingEscrow.deploy(
        erc20Mock.address, // token
        "Boost-lock APY", // name
        "blAPY", // symbol
        "1.0.0" // version
      )
    ).to.not.be.reverted;
    expect(veCrv.address).to.not.equal(ZERO_ADDRESS);

    expect(await veCrv.symbol()).to.equal("blAPY");
    expect(await veCrv.name()).to.equal("Boost-lock APY");
    expect(await veCrv.version()).to.equal("1.0.0");
    expect(await veCrv.decimals()).to.equal(9);
  });
});
