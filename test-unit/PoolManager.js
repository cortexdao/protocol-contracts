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
  let PoolManager;
  let ProxyAdmin;

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

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    PoolManager = await ethers.getContractFactory("PoolManager");
    const PoolManagerProxy = await ethers.getContractFactory(
      "PoolManagerProxy"
    );

    const logic = await PoolManager.deploy();
    await logic.deployed();

    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    const mAptMock = await deployMockContract(deployer, []);
    addressRegistryMock = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    await addressRegistryMock.mock.mAptAddress.returns(mAptMock.address);
    await addressRegistryMock.mock.getAddress
      .withArgs(bytes32("tvlManager"))
      .returns(tvlManager.address);
    await addressRegistryMock.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistryMock.mock.lpSafeAddress.returns(lpSafe.address);

    const proxy = await PoolManagerProxy.deploy(
      logic.address,
      proxyAdmin.address,
      addressRegistryMock.address
    );
    await proxy.deployed();
    poolManager = await PoolManager.attach(proxy.address);
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
    it("Cannot set to zero address", async () => {
      await expect(
        poolManager.connect(emergencySafe).setAddressRegistry(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });

    it("Emergency Safe can set", async () => {
      const contract = await deployMockContract(deployer, []);
      await poolManager
        .connect(emergencySafe)
        .setAddressRegistry(contract.address);
      expect(await poolManager.addressRegistry()).to.equal(contract.address);
    });
  });

  describe("Setting admin address", () => {
    it("Emergency Safe can set to valid address", async () => {
      await poolManager.connect(emergencySafe).setAdminAddress(FAKE_ADDRESS);
      expect(await poolManager.proxyAdmin()).to.equal(FAKE_ADDRESS);
    });

    it("Non-owner cannot set", async () => {
      await expect(
        poolManager.connect(randomUser).setAdminAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        poolManager.connect(emergencySafe).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });
  });

  describe("LP Safe Funder", () => {
    describe("fundLpSafe", () => {
      it("LP Safe can call", async () => {
        await poolManager.connect(lpSafe).fundLpSafe([]);
        // await expect(
        // ).to.not.be
        //   .reverted;
      });

      it("Non-owner cannot call", async () => {
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

      it("Non-owner cannot call", async () => {
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
