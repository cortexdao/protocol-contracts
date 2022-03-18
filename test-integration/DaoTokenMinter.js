const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  ZERO_ADDRESS,
  tokenAmountToBigNumber,
  impersonateAccount,
  getProxyAdmin,
} = require("../utils/helpers");

const GOV_TOKEN_ADDRESS = "0x95a4492F028aa1fd432Ea71146b433E7B4446611";
const BLAPY_TOKEN_ADDRESS = "0xDC9EFf7BB202Fd60dE3f049c7Ec1EfB08006261f";

describe.only("DaoTokenMinter", () => {
  // signers
  let deployer;
  let randomUser;
  let sender;
  let recipient;
  let locker;

  // deployed contracts
  let minter;
  let daoToken;
  let daoVotingEscrow;
  // MAINNET contracts
  let govToken;
  let blApy;
  let proxyAdmin;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Upgrade Governance Token for time-lock functionality", async () => {
    [deployer, sender, recipient, randomUser, locker] =
      await ethers.getSigners();

    const proxy = await ethers.getContractAt(
      "TransparentUpgradeableProxy",
      GOV_TOKEN_ADDRESS
    );
    proxyAdmin = await getProxyAdmin(proxy.address);
    deployer = await impersonateAccount(await proxyAdmin.owner(), 1000);

    const GovernanceTokenV2 = await ethers.getContractFactory(
      "GovernanceTokenV2"
    );
    const logicV2 = await GovernanceTokenV2.connect(deployer).deploy();
    await proxyAdmin.connect(deployer).upgrade(proxy.address, logicV2.address);

    govToken = await GovernanceTokenV2.attach(proxy.address);
  });

  before("Attach to blAPY contract", async () => {
    blApy = await ethers.getContractAt("VotingEscrow", BLAPY_TOKEN_ADDRESS);
  });

  before("Deploy DAO token", async () => {
    const DaoToken = await ethers.getContractFactory("DaoToken");
    const logic = await DaoToken.deploy();
    const TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    const initData = await logic.interface.encodeFunctionData(
      "initialize()",
      []
    );
    const proxy = await TransparentUpgradeableProxy.deploy(
      logic.address,
      proxyAdmin.address,
      initData
    );
    daoToken = await DaoToken.attach(proxy.address);
  });

  before("Deploy DAO Voting Escrow", async () => {
    const DaoVotingEscrow = await ethers.getContractFactory("DaoVotingEscrow");
    daoVotingEscrow = await DaoVotingEscrow.deploy(
      daoToken.address,
      "Boost-Lock CXD",
      "blCXD",
      "1.0.0"
    );
  });

  before("Deploy DAO token minter", async () => {
    const DaoTokenMinter = await ethers.getContractFactory("DaoTokenMinter");
    minter = await DaoTokenMinter.deploy(
      daoToken.address,
      daoVotingEscrow.address
    );
  });

  describe("Defaults", () => {
    it("Mint fails", async () => {
      await expect(minter.mint()).to.be.revertedWith("AIRDROP_INACTIVE");
    });
  });

  describe("vanilla mint", () => {
    let userBalance;

    before("set lock end", async () => {
      const timestamp = (await ethers.provider.getBlock()).timestamp;
      const lockEnd = timestamp + 86400 * 7;
      await govToken.connect(deployer).setLockEnd(lockEnd);
    });

    before("add minter as locker", async () => {
      await govToken.connect(deployer).addLocker(minter.address);
    });

    before("prepare user APY balance", async () => {
      userBalance = tokenAmountToBigNumber("1000");
      await govToken.connect(deployer).transfer(sender.address, userBalance);
    });

    it("mint DAO tokens", async () => {
      expect.fail();
    });
  });
});
