const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const { bytes32 } = require("../utils/helpers");
const {
  FAKE_ADDRESS,
  expectEventInTransaction,
  ANOTHER_FAKE_ADDRESS,
} = require("../utils/helpers");
const { deployMockContract } = require("@ethereum-waffle/mock-contract");
const erc20Interface = new ethers.utils.Interface(
  artifacts.require("ERC20").abi
);

describe("Contract: AccountManager", () => {
  // signers
  let deployer;
  let randomUser;

  // contract factories
  let AccountManager;
  let ProxyAdmin;
  let GenericExecutor;

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
    [deployer, randomUser] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    AccountManager = await ethers.getContractFactory("AccountManager");
    const AccountManagerProxy = await ethers.getContractFactory(
      "AccountManagerProxy"
    );
    GenericExecutor = await ethers.getContractFactory("GenericExecutor");
    executor = await GenericExecutor.deploy();
    await executor.deployed();

    const logic = await AccountManager.deploy();
    await logic.deployed();

    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    const addressRegistryMock = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistry").abi
    );
    await addressRegistryMock.mock.getAddress.returns(FAKE_ADDRESS);
    const proxy = await AccountManagerProxy.deploy(
      logic.address,
      proxyAdmin.address,
      addressRegistryMock.address
    );
    await proxy.deployed();
    manager = await AccountManager.attach(proxy.address);
  });

  describe("Defaults", () => {
    it("Owner is set to deployer", async () => {
      expect(await manager.owner()).to.equal(deployer.address);
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

  describe("Account factory", () => {
    let account;

    let tokenA;
    let tokenB;

    // test data
    const spenderAddress = ANOTHER_FAKE_ADDRESS;
    const approvalAmount = "100";
    const encodedApprove = erc20Interface.encodeFunctionData(
      "approve(address,uint256)",
      [spenderAddress, approvalAmount]
    );

    before("Deploy Account", async () => {
      // NOTE: I use a real ERC20 contract here since MockContract cannot emit events
      const ERC20 = await ethers.getContractFactory("ERC20");
      tokenA = await ERC20.deploy("TokenA", "A");
      await tokenA.deployed();
      tokenB = await ERC20.deploy("TokenB", "B");
      await tokenB.deployed();

      const accountAddress = await manager.callStatic.deployAccount(
        bytes32("account1"),
        executor.address
      );
      await manager.deployAccount(bytes32("account1"), executor.address);

      const Account = await ethers.getContractFactory("Account");
      account = await Account.attach(accountAddress);
    });

    it("Account owner is manager", async () => {
      expect(await account.owner()).to.equal(manager.address);
    });

    describe("execute", () => {
      it("Non-owner cannot call", async () => {
        await expect(
          manager.connect(randomUser).execute(bytes32("account1"), [], [])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Owner can call", async () => {
        const trx = await manager.connect(deployer).execute(
          bytes32("account1"),
          [
            [tokenA.address, encodedApprove],
            [tokenB.address, encodedApprove],
          ],
          []
        );

        await expectEventInTransaction(trx.hash, tokenA, "Approval", {
          owner: account.address,
          spender: spenderAddress,
          value: approvalAmount,
        });
        await expectEventInTransaction(trx.hash, tokenB, "Approval", {
          owner: account.address,
          spender: spenderAddress,
          value: approvalAmount,
        });
      });
    });
  });
});
