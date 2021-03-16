const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const { bytes32 } = require("../utils/helpers");
const { FAKE_ADDRESS } = require("../utils/helpers");
const { deployMockContract } = require("@ethereum-waffle/mock-contract");

describe("Contract: APYPoolManager", () => {
  // signers
  let deployer;
  let randomUser;
  let accounts;

  // contract factories
  let APYPoolManager;
  let ProxyAdmin;
  let APYGenericExecutor;

  // deployed contracts
  let manager;
  let executor;

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
    APYPoolManager = await ethers.getContractFactory("APYPoolManager");
    const APYPoolManagerProxy = await ethers.getContractFactory(
      "APYPoolManagerProxy"
    );
    APYGenericExecutor = await ethers.getContractFactory("APYGenericExecutor");
    executor = await APYGenericExecutor.deploy();
    await executor.deployed();

    const logic = await APYPoolManager.deploy();
    await logic.deployed();

    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    const mAptMock = await deployMockContract(deployer, []);
    const addressRegistryMock = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistry").abi
    );
    await addressRegistryMock.mock.getAddress.returns(FAKE_ADDRESS);
    const proxy = await APYPoolManagerProxy.deploy(
      logic.address,
      proxyAdmin.address,
      mAptMock.address,
      addressRegistryMock.address
    );
    await proxy.deployed();
    manager = await APYPoolManager.attach(proxy.address);
  });

  describe("Defaults", () => {
    it("Owner is set to deployer", async () => {
      expect(await manager.owner()).to.equal(deployer.address);
    });
  });

  describe("Set metapool token", () => {
    it("Non-owner cannot set", async () => {
      await expect(
        manager.connect(randomUser).setMetaPoolToken(FAKE_ADDRESS)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can set", async () => {
      const contract = await deployMockContract(deployer, []);
      await manager.connect(deployer).setMetaPoolToken(contract.address);
      expect(await manager.mApt()).to.equal(contract.address);
    });
  });

  describe("Set address registry", () => {
    it("Cannot set to zero address", async () => {
      await expect(
        manager.connect(deployer).setAddressRegistry(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });

    it("Non-owner cannot set", async () => {
      await expect(
        manager.connect(randomUser).setAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can set", async () => {
      const contract = await deployMockContract(deployer, []);
      await manager.connect(deployer).setAddressRegistry(contract.address);
      expect(await manager.addressRegistry()).to.equal(contract.address);
    });
  });

  describe.skip("Test setting pool ids", () => {
    it("Test setting pool ids by not owner", async () => {});
    it("Test setting pool ids successfully", async () => {});
  });

  describe("Setting admin address", () => {
    it("Owner can set to valid address", async () => {
      await manager.connect(deployer).setAdminAddress(FAKE_ADDRESS);
      expect(await manager.proxyAdmin()).to.equal(FAKE_ADDRESS);
    });

    it("Non-owner cannot set", async () => {
      await expect(
        manager.connect(randomUser).setAdminAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        manager.connect(deployer).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });
  });

  describe("Setting accountFactory address", () => {
    it("Owner can set to valid address", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      await manager.connect(deployer).setAccountFactory(dummyContract.address);
      expect(await manager.accountFactory()).to.equal(dummyContract.address);
    });

    it("Non-owner cannot set", async () => {
      const dummyContract = await deployMockContract(deployer, []);
      await expect(
        manager.connect(randomUser).setAccountFactory(dummyContract.address)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Cannot set to non-contract address", async () => {
      await expect(
        manager.connect(deployer).setAccountFactory(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
      await expect(
        manager.connect(deployer).setAccountFactory(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });
  });

  describe("Account Funder", () => {
    let fundedAccount;
    const accountId = bytes32("account1");

    before("Setup mock accountFactory", async () => {
      fundedAccount = accounts[0];
      const accountFactoryMock = await deployMockContract(
        deployer,
        artifacts.require("IAccountFactory").abi
      );
      await accountFactoryMock.mock.getAccount.returns(ZERO_ADDRESS);
      await accountFactoryMock.mock.getAccount
        .withArgs(accountId)
        .returns(fundedAccount.address);
      await manager.setAccountFactory(accountFactoryMock.address);
    });

    describe("fundAccount", () => {
      it("Owner can call", async () => {
        await expect(manager.connect(deployer).fundAccount(accountId, [])).to
          .not.be.reverted;
      });

      it("Non-owner cannot call", async () => {
        await expect(
          manager.connect(randomUser).fundAccount(accountId, [])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on invalid account", async () => {
        await expect(
          manager.connect(deployer).fundAccount(bytes32("invalidAccount"), [])
        ).to.be.revertedWith("INVALID_ACCOUNT");
      });
    });

    describe("withdrawFromAccount", () => {
      it("Owner can call", async () => {
        await expect(
          manager.connect(deployer).withdrawFromAccount(accountId, [])
        ).to.not.be.reverted;
      });

      it("Non-owner cannot call", async () => {
        await expect(
          manager.connect(randomUser).withdrawFromAccount(accountId, [])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on invalid account", async () => {
        await expect(
          manager
            .connect(deployer)
            .withdrawFromAccount(bytes32("invalidAccount"), [])
        ).to.be.revertedWith("INVALID_ACCOUNT");
      });
    });
  });
});
