const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const { FAKE_ADDRESS, bytes32 } = require("../utils/helpers");
const { deployMockContract } = require("@ethereum-waffle/mock-contract");

describe("Contract: PoolManager", () => {
  // signers
  let deployer;
  let randomUser;
  let emergencySafe;
  let lpSafe;
  let tvlManager;

  // contract factories
  let PoolManagerFactory;

  // deployed contracts
  let poolManager;
  let addressRegistryMock;

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
    [
      deployer,
      randomUser,
      emergencySafe,
      lpSafe,
      tvlManager,
    ] = await ethers.getSigners();
    const mAptMock = await deployMockContract(deployer, []);
    addressRegistryMock = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    await addressRegistryMock.mock.mAptAddress.returns(mAptMock.address);
    await addressRegistryMock.mock.getAddress
      .withArgs(bytes32("tvlManager"))
      .returns(tvlManager.address);
    // these addresses need to be registered to setup roles
    // in the PoolManager constructor:
    // - emergencySafe (default admin role, emergency role)
    // - lpSafe (LP role)
    await addressRegistryMock.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistryMock.mock.lpSafeAddress.returns(lpSafe.address);

    PoolManagerFactory = await ethers.getContractFactory("PoolManager");
    poolManager = await PoolManagerFactory.deploy(addressRegistryMock.address);
    await poolManager.deployed();
  });

  describe("Defaults", () => {
    it("Default admin role given to emergency safe", async () => {
      const DEFAULT_ADMIN_ROLE = await poolManager.DEFAULT_ADMIN_ROLE();
      const memberCount = await poolManager.getRoleMemberCount(
        DEFAULT_ADMIN_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(
        await poolManager.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)
      ).to.be.true;
    });

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await poolManager.LP_ROLE();
      const memberCount = await poolManager.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await poolManager.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await poolManager.EMERGENCY_ROLE();
      const memberCount = await poolManager.getRoleMemberCount(EMERGENCY_ROLE);
      expect(memberCount).to.equal(1);
      expect(await poolManager.hasRole(EMERGENCY_ROLE, emergencySafe.address))
        .to.be.true;
    });
  });

  describe("Set address registry", () => {
    it("Emergency Safe can set to contract address", async () => {
      const contract = await deployMockContract(deployer, []);
      await poolManager
        .connect(emergencySafe)
        .setAddressRegistry(contract.address);
      expect(await poolManager.addressRegistry()).to.equal(contract.address);
    });

    it("Unpermissioned cannot set", async () => {
      const contract = await deployMockContract(deployer, []);
      await expect(
        poolManager.connect(randomUser).setAddressRegistry(contract.address)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Cannot set to non-contract address", async () => {
      await expect(
        poolManager.connect(emergencySafe).setAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });
  });

  describe("LP Safe Funder", () => {
    describe("fundLpSafe", () => {
      it("LP Safe can call", async () => {
        await expect(poolManager.connect(lpSafe).fundLpSafe([])).to.not.be
          .reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          poolManager.connect(randomUser).fundLpSafe([])
        ).to.be.revertedWith("NOT_LP_ROLE");
      });

      it("Revert on unregistered LP Safe address", async () => {
        await addressRegistryMock.mock.lpSafeAddress.returns(ZERO_ADDRESS);
        await expect(
          poolManager.connect(lpSafe).fundLpSafe([])
        ).to.be.revertedWith("INVALID_LP_SAFE");
      });
    });

    describe("withdrawFromLpSafe", () => {
      it("LP Safe can call", async () => {
        await expect(poolManager.connect(lpSafe).withdrawFromLpSafe([])).to.not
          .be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          poolManager.connect(randomUser).withdrawFromLpSafe([])
        ).to.be.revertedWith("NOT_LP_ROLE");
      });

      it("Revert on unregistered LP Safe address", async () => {
        await addressRegistryMock.mock.lpSafeAddress.returns(ZERO_ADDRESS);
        await expect(
          poolManager.connect(lpSafe).withdrawFromLpSafe([])
        ).to.be.revertedWith("INVALID_LP_SAFE");
      });
    });
  });
});
