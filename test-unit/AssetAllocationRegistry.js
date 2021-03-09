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

  // deployed contracts
  let registry;

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

    registry = await AssetAllocationRegistry.deploy(manager.address);
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

  describe("Token registration", () => {
    describe("addAssetAllocation", async () => {
      it("Non-owner cannot call", async () => {
        const allocationId = bytes32("");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        await expect(
          registry
            .connect(randomUser)
            .addAssetAllocation(allocationId, data, symbol, decimals)
        ).to.be.revertedWith("PERMISSIONED_ONLY");
      });

      it("Owner can call", async () => {
        const allocationId = bytes32("");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        await expect(
          registry
            .connect(deployer)
            .addAssetAllocation(allocationId, data, symbol, decimals)
        ).to.not.be.reverted;
      });

      it("Manager can call", async () => {
        const allocationId = bytes32("");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        await expect(
          registry
            .connect(manager)
            .addAssetAllocation(allocationId, data, symbol, decimals)
        ).to.not.be.reverted;
      });
    });

    describe("deregisterTokens", async () => {
      it("Non-owner cannot call", async () => {
        const allocationId = bytes32("");
        await expect(
          registry.connect(randomUser).removeAssetAllocation(allocationId)
        ).to.be.revertedWith("PERMISSIONED_ONLY");
      });

      it("Owner can call", async () => {
        const allocationId = bytes32("");
        await expect(
          registry.connect(deployer).removeAssetAllocation(allocationId)
        ).to.not.be.reverted;
      });

      it("Manager can call", async () => {
        const allocationId = bytes32("");
        await expect(
          registry.connect(manager).removeAssetAllocation(allocationId)
        ).to.not.be.reverted;
      });
    });

    it("isAssetAllocationRegistered", async () => {
      const allocationId_1 = bytes32("allocation 1");
      const allocationId_2 = bytes32("allocation 2");
      const data = [FAKE_ADDRESS, bytes32("")];
      const symbol = "FOO";
      const decimals = 18;
      await registry.addAssetAllocation(allocationId_1, data, symbol, decimals);

      expect(await registry.isAssetAllocationRegistered(allocationId_1)).to.be
        .true;
      expect(await registry.isAssetAllocationRegistered(allocationId_2)).to.be
        .false;
    });

    describe("getAssetAllocationIds", () => {
      it("Retrieves single registered allocation", async () => {
        const allocationId = bytes32("allocation 1");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        const allocationIds = [allocationId];
        await registry.addAssetAllocation(allocationId, data, symbol, decimals);

        expect(await registry.getAssetAllocationIds()).to.have.members(
          allocationIds
        );
        expect(await registry.getAssetAllocationIds()).to.have.lengthOf(
          allocationIds.length
        );
      });

      it("Does not return duplicates", async () => {
        const allocationId_1 = bytes32("allocation 1");
        const allocationId_2 = bytes32("allocation 2");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        await registry.addAssetAllocation(
          allocationId_1,
          data,
          symbol,
          decimals
        );
        await registry.addAssetAllocation(
          allocationId_2,
          data,
          symbol,
          decimals
        );
        await registry.addAssetAllocation(
          allocationId_1,
          data,
          symbol,
          decimals
        );

        const expectedAssetAllocationIds = [allocationId_1, allocationId_2];
        expect(await registry.getAssetAllocationIds()).to.have.members(
          expectedAssetAllocationIds
        );
        expect(await registry.getAssetAllocationIds()).to.have.lengthOf(
          expectedAssetAllocationIds.length
        );
      });

      it("Does not retrieve deregistered allocations", async () => {
        const allocationId_1 = bytes32("allocation 1");
        const allocationId_2 = bytes32("allocation 2");
        const allocationId_3 = bytes32("allocation 3");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;

        const deregisteredIds = [allocationId_1];
        const leftoverIds = [allocationId_2, allocationId_3];
        const allocationIds = deregisteredIds.concat(leftoverIds);

        for (const id of allocationIds) {
          await registry.addAssetAllocation(id, data, symbol, decimals);
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

      it("Returns allocations still registered after deregistration", async () => {
        const allocationId_1 = bytes32("allocation 1");
        const allocationId_2 = bytes32("allocation 2");
        const allocationId_3 = bytes32("allocation 3");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        for (const id of [allocationId_1, allocationId_2, allocationId_3]) {
          await registry.addAssetAllocation(id, data, symbol, decimals);
        }

        await registry.removeAssetAllocation(allocationId_3);
        expect(await registry.getAssetAllocationIds()).to.not.include(
          allocationId_3
        );
        expect(await registry.getAssetAllocationIds()).to.have.lengthOf(2);

        await registry.removeAssetAllocation(allocationId_1);
        expect(await registry.getAssetAllocationIds()).to.have.lengthOf(1);
        expect(await registry.getAssetAllocationIds()).to.have.members([
          allocationId_2,
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
      const allocationId = bytes32("allocation 1");
      const symbol = "FOO";
      const decimals = 18;
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

      await registry.addAssetAllocation(allocationId, data, symbol, decimals);

      const balance = await registry.balanceOf(allocationId);
      expect(balance).to.equal(expectedBalance);
    });

    it("Call that reverts", async () => {
      const allocationId = bytes32("allocation 1");
      const symbol = "FOO";
      const decimals = 18;
      const invalidStrategy = FAKE_ADDRESS;
      // create the step to execute
      const iface = new ethers.utils.Interface(peripheryAbi);
      const encodedBalance = iface.encodeFunctionData("balance(address)", [
        invalidStrategy,
      ]);
      const data = [peripheryContract.address, encodedBalance];
      // step execution will revert
      await peripheryContract.mock.balance.reverts();

      await registry.addAssetAllocation(allocationId, data, symbol, decimals);

      await expect(registry.balanceOf(allocationId)).to.be.reverted;
    });

    it("Revert on unregistered ID", async () => {
      const registeredId = bytes32("allocation 1");
      const unregisteredId = bytes32("allocation 2");
      const symbol = "FOO";
      const decimals = 18;
      const data = [FAKE_ADDRESS, bytes32("")];
      await registry.addAssetAllocation(registeredId, data, symbol, decimals);

      await expect(registry.balanceOf(unregisteredId)).to.be.revertedWith(
        "INVALID_ALLOCATION_ID"
      );
    });
  });

  it("symbolOf", async () => {
    const allocationId = bytes32("allocation 1");
    const data = [FAKE_ADDRESS, bytes32("")];
    const symbol = "FOO";
    const decimals = 18;
    await registry.addAssetAllocation(allocationId, data, symbol, decimals);

    expect(await registry.symbolOf(allocationId)).to.equal(symbol);
  });

  it("decimalsOf", async () => {
    const allocationId = bytes32("allocation 1");
    const data = [FAKE_ADDRESS, bytes32("")];
    const symbol = "FOO";
    const decimals = 18;
    await registry.addAssetAllocation(allocationId, data, symbol, decimals);

    expect(await registry.decimalsOf(allocationId)).to.equal(decimals);
  });
});
