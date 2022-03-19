const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  impersonateAccount,
  getProxyAdmin,
} = require("../utils/helpers");

const GOV_TOKEN_ADDRESS = "0x95a4492F028aa1fd432Ea71146b433E7B4446611";
const BLAPY_TOKEN_ADDRESS = "0xDC9EFf7BB202Fd60dE3f049c7Ec1EfB08006261f";

describe.only("DaoTokenMinter", () => {
  // signers
  let deployer;
  let user;

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
    [deployer, user] = await ethers.getSigners();

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

  describe("Constructor", () => {
    it("Contract fails to deploy when passed invalid DAO address", async () => {
      const DaoTokenMinter = await ethers.getContractFactory("DaoTokenMinter");
      await expect(
        DaoTokenMinter.deploy(
          ethers.constants.AddressZero,
          daoVotingEscrow.address
        )
      ).to.be.revertedWith("INVALID_DAO_ADDRESS");
    });

    it("Contract fails to deploy when passed invalid Escrow address", async () => {
      const DaoTokenMinter = await ethers.getContractFactory("DaoTokenMinter");
      await expect(
        DaoTokenMinter.deploy(daoToken.address, ethers.constants.AddressZero)
      ).to.be.revertedWith("INVALID_ESCROW_ADDRESS");
    });
  });

  describe("Defaults", () => {
    it("Storage variable are set correctly", async () => {
      expect(await minter.APY_TOKEN_ADDRESS()).to.equal(govToken.address);
      expect(await minter.BLAPY_TOKEN_ADDRESS()).to.equal(blApy.address);
      expect(await minter.DAO_TOKEN_ADDRESS()).to.equal(daoToken.address);
      expect(await minter.VE_TOKEN_ADDRESS()).to.equal(daoVotingEscrow.address);
    });

    it("Mint fails", async () => {
      await expect(minter.connect(user).mint()).to.be.revertedWith(
        "AIRDROP_INACTIVE"
      );
    });

    it("Mint Boost Locked fails", async () => {
      await expect(minter.connect(user).mintBoostLocked()).to.be.revertedWith(
        "AIRDROP_INACTIVE"
      );
    });
  });

  describe("Regular mint", () => {
    let userBalance;

    before("Set lock end", async () => {
      const timestamp = (await ethers.provider.getBlock()).timestamp;
      const lockEnd = timestamp + 86400 * 7;
      await govToken.connect(deployer).setLockEnd(lockEnd);
    });

    before("Add minter as locker", async () => {
      await govToken.connect(deployer).addLocker(minter.address);
    });

    before("Prepare user APY balance", async () => {
      userBalance = tokenAmountToBigNumber("1000");
      await govToken.connect(deployer).transfer(user.address, userBalance);
    });

    it("Can mint DAO tokens", async () => {
      expect(await daoToken.balanceOf(user.address)).to.equal(0);
      await minter.connect(user).mint();

      expect(await daoToken.balanceOf(user.address)).to.equal(userBalance);
    });

    it("Revert mint if mint isn't locker", async () => {
      await govToken.connect(deployer).removeLocker(minter.address);

      await expect(minter.connect(user).mint()).to.be.revertedWith(
        "LOCKER_ONLY"
      );
    });
  });

  describe("Boost-lock mint", () => {
    let userBalance;

    before("Set lock end", async () => {
      const timestamp = (await ethers.provider.getBlock()).timestamp;
      const lockEnd = timestamp + 86400 * 7;
      await govToken.connect(deployer).setLockEnd(lockEnd);
    });

    before("Add minter as locker", async () => {
      await govToken.connect(deployer).addLocker(minter.address);
    });

    before("Prepare user APY balance", async () => {
      userBalance = tokenAmountToBigNumber("1000");
      await govToken.connect(deployer).transfer(user.address, userBalance);
      await blApy
        .connect(user)
        .create_lock(userBalance, await govToken.lockEnd());
    });

    it("Can mint boost-locked DAO tokens", async () => {
      expect(await daoToken.balanceOf(user.address)).to.equal(0);
      await minter.connect(user).mintBoostLocked();
      expect(await daoToken.balanceOf(user.address)).to.equal(userBalance);
    });

    // it("Revert mint if mint isn't locker", async () => {
    //   await govToken.connect(deployer).removeLocker(minter.address);

    //   await expect(minter.connect(user).mint()).to.be.revertedWith(
    //     "LOCKER_ONLY"
    //   );
    // });
  });
});
