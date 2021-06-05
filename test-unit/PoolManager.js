const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const { FAKE_ADDRESS } = require("../utils/helpers");
const { deployMockContract } = require("@ethereum-waffle/mock-contract");

describe("Contract: PoolManager", () => {
  // signers
  let deployer;
  let randomUser;
  let accounts;

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
    [deployer, randomUser, ...accounts] = await ethers.getSigners();

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

    await addressRegistryMock.mock.getAddress.returns(FAKE_ADDRESS);
    const proxy = await PoolManagerProxy.deploy(
      logic.address,
      proxyAdmin.address,
      addressRegistryMock.address
    );
    await proxy.deployed();
    poolManager = await PoolManager.attach(proxy.address);
  });

  describe("Defaults", () => {
    it("Owner is set to deployer", async () => {
      expect(await poolManager.owner()).to.equal(deployer.address);
    });
  });

  describe("Set address registry", () => {
    it("Cannot set to zero address", async () => {
      await expect(
        poolManager.connect(deployer).setAddressRegistry(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });

    it("Owner can set", async () => {
      const contract = await deployMockContract(deployer, []);
      await poolManager.connect(deployer).setAddressRegistry(contract.address);
      expect(await poolManager.addressRegistry()).to.equal(contract.address);
    });
  });

  describe("Setting admin address", () => {
    it("Owner can set to valid address", async () => {
      await poolManager.connect(deployer).setAdminAddress(FAKE_ADDRESS);
      expect(await poolManager.proxyAdmin()).to.equal(FAKE_ADDRESS);
    });

    it("Non-owner cannot set", async () => {
      await expect(
        poolManager.connect(randomUser).setAdminAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        poolManager.connect(deployer).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });
  });

  describe("LP Safe Funder", () => {
    let fundedAccount;

    before("Setup mock address registry", async () => {
      fundedAccount = accounts[0];
      await addressRegistryMock.mock.lpSafeAddress.returns(
        fundedAccount.address
      );
    });

    describe("fundLpSafe", () => {
      it("Owner can call", async () => {
        await expect(poolManager.connect(deployer).fundLpSafe([])).to.not.be
          .reverted;
      });

      it("Non-owner cannot call", async () => {
        await expect(
          poolManager.connect(randomUser).fundLpSafe([])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on unregistered LP Safe address", async () => {
        await addressRegistryMock.mock.lpSafeAddress.returns(ZERO_ADDRESS);
        await expect(
          poolManager.connect(deployer).fundLpSafe([])
        ).to.be.revertedWith("INVALID_LP_SAFE");
      });
    });

    describe("withdrawFromLpSafe", () => {
      it("Owner can call", async () => {
        await expect(poolManager.connect(deployer).withdrawFromLpSafe([])).to
          .not.be.reverted;
      });

      it("Non-owner cannot call", async () => {
        await expect(
          poolManager.connect(randomUser).withdrawFromLpSafe([])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on unregistered LP Safe address", async () => {
        await addressRegistryMock.mock.lpSafeAddress.returns(ZERO_ADDRESS);
        await expect(
          poolManager.connect(deployer).withdrawFromLpSafe([])
        ).to.be.revertedWith("INVALID_LP_SAFE");
      });
    });
  });
});
