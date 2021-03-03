const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  ZERO_ADDRESS,
  FAKE_ADDRESS,
  tokenAmountToBigNumber,
  bytes32,
} = require("../utils/helpers");

describe("Contract: AssetAllocationRegistry", () => {
  // signers
  let deployer;
  let manager;
  let randomUser;

  // contract factories
  let AssetAllocationRegistry;
  let APYViewExecutor;

  // deployed contracts
  let registry;
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
    [deployer, manager, randomUser] = await ethers.getSigners();

    AssetAllocationRegistry = await ethers.getContractFactory(
      "AssetAllocationRegistry"
    );
    APYViewExecutor = await ethers.getContractFactory("APYViewExecutor");

    executor = await APYViewExecutor.deploy();
    await executor.deployed();

    registry = await AssetAllocationRegistry.deploy(
      manager.address,
      executor.address
    );
    await registry.deployed();
  });

  describe("Defaults", () => {
    it("Owner is set to deployer", async () => {
      expect(await registry.owner()).to.equal(deployer.address);
    });
  });

  describe("Setting manager address", () => {
    it("Owner can set to valid address", async () => {
      await registry.connect(deployer).setManagerAddress(FAKE_ADDRESS);
      expect(await registry.manager()).to.equal(FAKE_ADDRESS);
    });

    it("Non-owner cannot set", async () => {
      await expect(
        registry.connect(randomUser).setManagerAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        registry.connect(deployer).setManagerAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_MANAGER");
    });
  });

  describe("Setting executor address", () => {
    it("Owner can set to valid address", async () => {
      await registry.connect(deployer).setExecutorAddress(FAKE_ADDRESS);
      expect(await registry.executor()).to.equal(FAKE_ADDRESS);
    });

    it("Non-owner cannot set", async () => {
      await expect(
        registry.connect(randomUser).setExecutorAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        registry.connect(deployer).setExecutorAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_EXECUTOR");
    });
  });

  describe("Token registration", () => {
    describe("addAssetAllocation", async () => {
      it("Non-owner cannot call", async () => {
        const sequenceId = bytes32("");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        await expect(
          registry
            .connect(randomUser)
            .addAssetAllocation(sequenceId, data, symbol)
        ).to.be.revertedWith("PERMISSIONED_ONLY");
      });

      it("Owner can call", async () => {
        const sequenceId = bytes32("");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        await expect(
          registry
            .connect(deployer)
            .addAssetAllocation(sequenceId, data, symbol)
        ).to.not.be.reverted;
      });

      it("Manager can call", async () => {
        const sequenceId = bytes32("");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        await expect(
          registry.connect(manager).addAssetAllocation(sequenceId, data, symbol)
        ).to.not.be.reverted;
      });
    });

    describe("deregisterTokens", async () => {
      it("Non-owner cannot call", async () => {
        const sequenceId = bytes32("");
        await expect(
          registry.connect(randomUser).removeAssetAllocation(sequenceId)
        ).to.be.revertedWith("PERMISSIONED_ONLY");
      });

      it("Owner can call", async () => {
        const sequenceId = bytes32("");
        await expect(
          registry.connect(deployer).removeAssetAllocation(sequenceId)
        ).to.not.be.reverted;
      });

      it("Manager can call", async () => {
        const sequenceId = bytes32("");
        await expect(
          registry.connect(manager).removeAssetAllocation(sequenceId)
        ).to.not.be.reverted;
      });
    });

    it("isAssetAllocationRegistered", async () => {
      const sequenceId_1 = bytes32("sequence 1");
      const sequenceId_2 = bytes32("sequence 2");
      const data = [FAKE_ADDRESS, bytes32("")];
      const symbol = "FOO";
      await registry.addAssetAllocation(sequenceId_1, data, symbol);

      expect(await registry.isAssetAllocationRegistered(sequenceId_1)).to.be
        .true;
      expect(await registry.isAssetAllocationRegistered(sequenceId_2)).to.be
        .false;
    });

    describe("getAssetAllocationIds", () => {
      it("Retrieves single registered sequence", async () => {
        const sequenceId = bytes32("sequence 1");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const sequenceIds = [sequenceId];
        await registry.addAssetAllocation(sequenceId, data, symbol);

        expect(await registry.getAssetAllocationIds()).to.have.members(
          sequenceIds
        );
        expect(await registry.getAssetAllocationIds()).to.have.lengthOf(
          sequenceIds.length
        );
      });

      it("Does not return duplicates", async () => {
        const sequenceId_1 = bytes32("sequence 1");
        const sequenceId_2 = bytes32("sequence 2");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        await registry.addAssetAllocation(sequenceId_1, data, symbol);
        await registry.addAssetAllocation(sequenceId_2, data, symbol);
        await registry.addAssetAllocation(sequenceId_1, data, symbol);

        const expectedAssetAllocationIds = [sequenceId_1, sequenceId_2];
        expect(await registry.getAssetAllocationIds()).to.have.members(
          expectedAssetAllocationIds
        );
        expect(await registry.getAssetAllocationIds()).to.have.lengthOf(
          expectedAssetAllocationIds.length
        );
      });

      it("Does not retrieve deregistered sequences", async () => {
        const sequenceId_1 = bytes32("sequence 1");
        const sequenceId_2 = bytes32("sequence 2");
        const sequenceId_3 = bytes32("sequence 3");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";

        const deregisteredIds = [sequenceId_1];
        const leftoverIds = [sequenceId_2, sequenceId_3];
        const sequenceIds = deregisteredIds.concat(leftoverIds);

        for (const id of sequenceIds) {
          await registry.addAssetAllocation(id, data, symbol);
        }
        for (const id of deregisteredIds) {
          await registry.removeAssetAllocation(id);
        }

        expect(await registry.getAssetAllocationIds()).to.have.members(
          leftoverIds
        );
        expect(await registry.getAssetAllocationIds()).to.have.lengthOf(
          leftoverIds.length
        );
      });

      it("Returns sequences still registered after deregistration", async () => {
        const sequenceId_1 = bytes32("sequence 1");
        const sequenceId_2 = bytes32("sequence 2");
        const sequenceId_3 = bytes32("sequence 3");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        for (const id of [sequenceId_1, sequenceId_2, sequenceId_3]) {
          await registry.addAssetAllocation(id, data, symbol);
        }

        await registry.removeAssetAllocation(sequenceId_3);
        expect(await registry.getAssetAllocationIds()).to.not.include(
          sequenceId_3
        );
        expect(await registry.getAssetAllocationIds()).to.have.lengthOf(2);

        await registry.removeAssetAllocation(sequenceId_1);
        expect(await registry.getAssetAllocationIds()).to.have.lengthOf(1);
        expect(await registry.getAssetAllocationIds()).to.have.members([
          sequenceId_2,
        ]);
      });
    });
  });

  describe("balanceOf", async () => {
    let peripheryContract;
    let peripheryAbi;

    before(async () => {
      peripheryAbi = [
        {
          name: "balance",
          inputs: [
            {
              internalType: "address",
              name: "strategy",
              type: "address",
            },
          ],
          outputs: [
            {
              internalType: "uint256",
              name: "",
              type: "uint256",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
      ];
      peripheryContract = await deployMockContract(deployer, peripheryAbi);
    });

    it("Call with address arg", async () => {
      const sequenceId = bytes32("sequence 1");
      const symbol = "FOO";
      const strategy = FAKE_ADDRESS;
      // create the step to execute
      const iface = new ethers.utils.Interface(peripheryAbi);
      const encodedBalance = iface.encodeFunctionData("balance(address)", [
        strategy,
      ]);
      const data = [peripheryContract.address, encodedBalance];
      // step execution should return a value
      const expectedBalance = tokenAmountToBigNumber(100);
      await peripheryContract.mock.balance
        .withArgs(strategy)
        .returns(expectedBalance);

      await registry.addAssetAllocation(sequenceId, data, symbol);

      const balance = await registry.balanceOf(sequenceId);
      expect(balance).to.equal(expectedBalance);
    });

    it("Call that reverts", async () => {
      const sequenceId = bytes32("sequence 1");
      const symbol = "FOO";
      const invalidStrategy = FAKE_ADDRESS;
      // create the step to execute
      const iface = new ethers.utils.Interface(peripheryAbi);
      const encodedBalance = iface.encodeFunctionData("balance(address)", [
        invalidStrategy,
      ]);
      const data = [peripheryContract.address, encodedBalance];
      // step execution will revert
      await peripheryContract.mock.balance.reverts();

      await registry.addAssetAllocation(sequenceId, data, symbol);

      await expect(registry.balanceOf(sequenceId)).to.be.reverted;
    });

    it("Revert on unregistered ID", async () => {
      const registeredId = bytes32("sequence 1");
      const unregisteredId = bytes32("sequence 2");
      const symbol = "FOO";
      const data = [FAKE_ADDRESS, bytes32("")];
      await registry.addAssetAllocation(registeredId, data, symbol);

      await expect(registry.balanceOf(unregisteredId)).to.be.revertedWith(
        "INVALID_ALLOCATION_ID"
      );
    });
  });

  it("symbolOf", async () => {
    const sequenceId = bytes32("sequence 1");
    const data = [FAKE_ADDRESS, bytes32("")];
    const symbol = "FOO";
    await registry.addAssetAllocation(sequenceId, data, symbol);

    expect(await registry.symbolOf(sequenceId)).to.equal(symbol);
  });
});
