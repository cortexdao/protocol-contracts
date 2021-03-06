const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const {
  FAKE_ADDRESS,
  expectEventInTransaction,
  ANOTHER_FAKE_ADDRESS,
} = require("../utils/helpers");
const erc20Interface = new ethers.utils.Interface(
  artifacts.require("ERC20").abi
);

describe("Contract: APYManager", () => {
  // signers
  let deployer;
  let randomUser;

  // contract factories
  let APYManager;
  let APYManagerV2;
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
    [deployer, randomUser] = await ethers.getSigners();

    APYManager = await ethers.getContractFactory("APYManager");
    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    APYManagerV2 = await ethers.getContractFactory("APYManagerV2");
    const ProxyConstructorArg = await ethers.getContractFactory(
      "ProxyConstructorArg"
    );
    const TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    APYGenericExecutor = await ethers.getContractFactory("APYGenericExecutor");
    executor = await APYGenericExecutor.deploy();
    await executor.deployed();

    const logic = await APYManager.deploy();
    await logic.deployed();
    const logicV2 = await APYManagerV2.deploy();
    await logicV2.deployed();

    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    const proxyConstructorArg = await ProxyConstructorArg.deploy();
    await proxyConstructorArg.deployed();
    const encodedArg = await proxyConstructorArg.getEncodedArg(
      proxyAdmin.address
    );
    const proxy = await TransparentUpgradeableProxy.deploy(
      logic.address,
      proxyAdmin.address,
      encodedArg
    );
    await proxy.deployed();

    await proxyAdmin.upgrade(proxy.address, logicV2.address);
    manager = await APYManagerV2.attach(proxy.address);
  });

  describe("Test initialization", () => {
    it("Cannot initialize with zero address", async () => {
      let tempManager = await APYManager.deploy();
      await tempManager.deployed();
      await expect(tempManager.initialize(ZERO_ADDRESS)).to.be.revertedWith(
        "INVALID_ADMIN"
      );
    });
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
      await manager.connect(deployer).setMetaPoolToken(FAKE_ADDRESS);
      expect(await manager.mApt()).to.equal(FAKE_ADDRESS);
    });
  });

  describe("Set address registry", () => {
    it("Cannot set to zero address", async () => {
      await expect(
        manager.connect(deployer).setAddressRegistry(ZERO_ADDRESS)
      ).to.be.revertedWith("Invalid address");
    });

    it("Non-owner cannot set", async () => {
      await expect(
        manager.connect(randomUser).setAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can set", async () => {
      await manager.connect(deployer).setAddressRegistry(FAKE_ADDRESS);
      expect(await manager.addressRegistry()).to.equal(FAKE_ADDRESS);
    });
  });

  describe("Set asset allocation registry", () => {
    it("Cannot set to zero address", async () => {
      await expect(
        manager.connect(deployer).setAssetAllocationRegistry(ZERO_ADDRESS)
      ).to.be.revertedWith("Invalid address");
    });

    it("Non-owner cannot set", async () => {
      await expect(
        manager.connect(randomUser).setAssetAllocationRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can set", async () => {
      await manager.connect(deployer).setAssetAllocationRegistry(FAKE_ADDRESS);
      expect(await manager.assetAllocationRegistry()).to.equal(FAKE_ADDRESS);
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

  describe("Strategy factory", () => {
    let strategy;

    let tokenA;
    let tokenB;

    // test data
    const spenderAddress = ANOTHER_FAKE_ADDRESS;
    const approvalAmount = "100";
    const encodedApprove = erc20Interface.encodeFunctionData(
      "approve(address,uint256)",
      [spenderAddress, approvalAmount]
    );

    before("Deploy strategy", async () => {
      // NOTE: I use a real ERC20 contract here since MockContract cannot emit events
      const ERC20 = await ethers.getContractFactory("ERC20");
      tokenA = await ERC20.deploy("TokenA", "A");
      await tokenA.deployed();
      tokenB = await ERC20.deploy("TokenB", "B");
      await tokenB.deployed();

      const strategyAddress = await manager.callStatic.deployStrategy(
        executor.address
      );
      await manager.deployStrategy(executor.address);

      const Strategy = await ethers.getContractFactory("Strategy");
      strategy = await Strategy.attach(strategyAddress);
    });

    it("Strategy owner is manager", async () => {
      expect(await strategy.owner()).to.equal(manager.address);
    });

    describe("fundStrategy", () => {
      it("Non-owner cannot call", async () => {
        await expect(
          manager
            .connect(randomUser)
            .fundStrategy(strategy.address, [[], []], [])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on invalid strategy", async () => {
        await expect(
          manager.connect(deployer).fundStrategy(FAKE_ADDRESS, [[], []], [])
        ).to.be.revertedWith("Invalid Strategy");
      });

      it("Owner can call", async () => {
        await expect(
          manager.connect(deployer).fundStrategy(strategy.address, [[], []], [])
        ).to.not.be.reverted;
      });
    });

    describe("fundAndExecute", () => {
      it("Non-owner cannot call", async () => {
        await expect(
          manager
            .connect(randomUser)
            .fundAndExecute(strategy.address, [[], []], [], [])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on invalid strategy", async () => {
        await expect(
          manager
            .connect(deployer)
            .fundAndExecute(FAKE_ADDRESS, [[], []], [], [])
        ).to.be.revertedWith("Invalid Strategy");
      });

      it("Owner can call", async () => {
        await expect(
          manager
            .connect(deployer)
            .fundAndExecute(strategy.address, [[], []], [], [])
        ).to.not.be.reverted;
      });
    });

    describe("execute", () => {
      it("Non-owner cannot call", async () => {
        await expect(
          manager.connect(randomUser).execute(strategy.address, [], [])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Owner can call", async () => {
        const trx = await manager.connect(deployer).execute(
          strategy.address,
          [
            [tokenA.address, encodedApprove],
            [tokenB.address, encodedApprove],
          ],
          []
        );

        await expectEventInTransaction(trx.hash, tokenA, "Approval", {
          owner: strategy.address,
          spender: spenderAddress,
          value: approvalAmount,
        });
        await expectEventInTransaction(trx.hash, tokenB, "Approval", {
          owner: strategy.address,
          spender: spenderAddress,
          value: approvalAmount,
        });
      });
    });

    describe("executeAndWithdraw", () => {
      it("Non-owner cannot call", async () => {
        await expect(
          manager
            .connect(randomUser)
            .executeAndWithdraw(strategy.address, [[], []], [], [])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on invalid strategy", async () => {
        await expect(
          manager
            .connect(deployer)
            .executeAndWithdraw(FAKE_ADDRESS, [[], []], [], [])
        ).to.be.revertedWith("Invalid Strategy");
      });

      it("Owner can call", async () => {
        await expect(
          manager
            .connect(deployer)
            .executeAndWithdraw(strategy.address, [[], []], [], [])
        ).to.not.be.reverted;
      });
    });

    describe("withdrawFromStrategy", () => {
      it("Non-owner cannot call", async () => {
        await expect(
          manager
            .connect(randomUser)
            .withdrawFromStrategy(strategy.address, [[], []], [])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on invalid strategy", async () => {
        await expect(
          manager
            .connect(deployer)
            .withdrawFromStrategy(FAKE_ADDRESS, [[], []], [])
        ).to.be.revertedWith("Invalid Strategy");
      });

      it("Owner can call", async () => {
        await expect(
          manager
            .connect(deployer)
            .withdrawFromStrategy(strategy.address, [[], []], [])
        ).to.not.be.reverted;
      });
    });
  });
});
