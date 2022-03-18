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
  let proxyAdmin;
  let logic;
  let logicV2;
  let proxy;
  let govToken;

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
    [deployer, sender, recipient, randomUser, locker] =
      await ethers.getSigners();

    proxy = await ethers.getContractAt(
      "TransparentUpgradeableProxy",
      GOV_TOKEN_ADDRESS
    );
    const proxyAdmin = await getProxyAdmin(proxy.address);
    deployer = await impersonateAccount(await proxyAdmin.owner(), 1000);

    const GovernanceTokenV2 = await ethers.getContractFactory(
      "GovernanceTokenV2"
    );
    logicV2 = await GovernanceTokenV2.connect(deployer).deploy();
    await proxyAdmin.connect(deployer).upgrade(proxy.address, logicV2.address);

    govToken = await GovernanceTokenV2.attach(proxy.address);
  });

  describe("vanilla mint", () => {
    let userBalance;

    before("set lock end", async () => {
      const timestamp = (await ethers.provider.getBlock()).timestamp;
      const lockEnd = timestamp + 86400 * 7;
      await govToken.connect(deployer).setLockEnd(lockEnd);
    });

    before("add locker", async () => {
      await govToken.connect(deployer).addLocker(locker.address);
      expect(await govToken.isLocker(locker.address)).to.be.true;
    });

    before("prepare user APY balance", async () => {
      userBalance = tokenAmountToBigNumber("1000");
      await govToken.connect(deployer).transfer(sender.address, userBalance);
      expect(await govToken.unlockedBalance(sender.address)).to.equal(
        userBalance
      );
    });

    it("mint DAO tokens", async () => {
      expect.fail();
    });
  });
});
