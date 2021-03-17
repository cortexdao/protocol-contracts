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

describe("Contract: TVLManager", () => {
  // signers
  let deployer;
  let manager;
  let randomUser;

  // contract factories
  let TVLManager;

  // deployed contracts
  let tvlManager;

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

    TVLManager = await ethers.getContractFactory("TVLManager");

    tvlManager = await TVLManager.deploy(manager.address);
    await tvlManager.deployed();
  });

  describe("Defaults", () => {
    it("Owner is set to deployer", async () => {
      expect(await tvlManager.owner()).to.equal(deployer.address);
    });
  });

  describe("Setting manager address", () => {
    it("Owner can set to valid address", async () => {
      await tvlManager.connect(deployer).setManagerAddress(FAKE_ADDRESS);
      expect(await tvlManager.manager()).to.equal(FAKE_ADDRESS);
    });

    it("Non-owner cannot set", async () => {
      await expect(
        tvlManager.connect(randomUser).setManagerAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        tvlManager.connect(deployer).setManagerAddress(ZERO_ADDRESS)
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
          tvlManager
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
          tvlManager
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
          tvlManager
            .connect(manager)
            .addAssetAllocation(allocationId, data, symbol, decimals)
        ).to.not.be.reverted;
      });
    });

    describe("deregisterTokens", async () => {
      it("Non-owner cannot call", async () => {
        const allocationId = bytes32("");
        await expect(
          tvlManager.connect(randomUser).removeAssetAllocation(allocationId)
        ).to.be.revertedWith("PERMISSIONED_ONLY");
      });

      it("Owner can call", async () => {
        const allocationId = bytes32("");
        await expect(
          tvlManager.connect(deployer).removeAssetAllocation(allocationId)
        ).to.not.be.reverted;
      });

      it("Manager can call", async () => {
        const allocationId = bytes32("");
        await expect(
          tvlManager.connect(manager).removeAssetAllocation(allocationId)
        ).to.not.be.reverted;
      });
    });

    it("isAssetAllocationRegistered", async () => {
      const allocationId_1 = bytes32("allocation 1");
      const allocationId_2 = bytes32("allocation 2");
      const data = [FAKE_ADDRESS, bytes32("")];
      const symbol = "FOO";
      const decimals = 18;
      await tvlManager.addAssetAllocation(
        allocationId_1,
        data,
        symbol,
        decimals
      );

      expect(await tvlManager.isAssetAllocationRegistered(allocationId_1)).to.be
        .true;
      expect(await tvlManager.isAssetAllocationRegistered(allocationId_2)).to.be
        .false;
    });

    describe("getAssetAllocationIds", () => {
      it("Retrieves single registered allocation", async () => {
        const allocationId = bytes32("allocation 1");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        const allocationIds = [allocationId];
        await tvlManager.addAssetAllocation(
          allocationId,
          data,
          symbol,
          decimals
        );

        expect(await tvlManager.getAssetAllocationIds()).to.have.members(
          allocationIds
        );
        expect(await tvlManager.getAssetAllocationIds()).to.have.lengthOf(
          allocationIds.length
        );
      });

      it("Does not return duplicates", async () => {
        const allocationId_1 = bytes32("allocation 1");
        const allocationId_2 = bytes32("allocation 2");
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        await tvlManager.addAssetAllocation(
          allocationId_1,
          data,
          symbol,
          decimals
        );
        await tvlManager.addAssetAllocation(
          allocationId_2,
          data,
          symbol,
          decimals
        );
        await tvlManager.addAssetAllocation(
          allocationId_1,
          data,
          symbol,
          decimals
        );

        const expectedAssetAllocationIds = [allocationId_1, allocationId_2];
        expect(await tvlManager.getAssetAllocationIds()).to.have.members(
          expectedAssetAllocationIds
        );
        expect(await tvlManager.getAssetAllocationIds()).to.have.lengthOf(
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
          await tvlManager.addAssetAllocation(id, data, symbol, decimals);
        }
        for (const id of deregisteredIds) {
          await tvlManager.removeAssetAllocation(id);
        }

        expect(await tvlManager.getAssetAllocationIds()).to.have.members(
          leftoverIds
        );
        expect(await tvlManager.getAssetAllocationIds()).to.have.lengthOf(
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
          await tvlManager.addAssetAllocation(id, data, symbol, decimals);
        }

        await tvlManager.removeAssetAllocation(allocationId_3);
        expect(await tvlManager.getAssetAllocationIds()).to.not.include(
          allocationId_3
        );
        expect(await tvlManager.getAssetAllocationIds()).to.have.lengthOf(2);

        await tvlManager.removeAssetAllocation(allocationId_1);
        expect(await tvlManager.getAssetAllocationIds()).to.have.lengthOf(1);
        expect(await tvlManager.getAssetAllocationIds()).to.have.members([
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
              name: "Account",
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
      const Account = FAKE_ADDRESS;
      // create the step to execute
      const iface = new ethers.utils.Interface(peripheryAbi);
      const encodedBalance = iface.encodeFunctionData("balance(address)", [
        Account,
      ]);
      const data = [peripheryContract.address, encodedBalance];
      // step execution should return a value
      const expectedBalance = tokenAmountToBigNumber(100);
      await peripheryContract.mock.balance
        .withArgs(Account)
        .returns(expectedBalance);

      await tvlManager.addAssetAllocation(allocationId, data, symbol, decimals);

      const balance = await tvlManager.balanceOf(allocationId);
      expect(balance).to.equal(expectedBalance);
    });

    it("Call that reverts", async () => {
      const allocationId = bytes32("allocation 1");
      const symbol = "FOO";
      const decimals = 18;
      const invalidAccount = FAKE_ADDRESS;
      // create the step to execute
      const iface = new ethers.utils.Interface(peripheryAbi);
      const encodedBalance = iface.encodeFunctionData("balance(address)", [
        invalidAccount,
      ]);
      const data = [peripheryContract.address, encodedBalance];
      // step execution will revert
      await peripheryContract.mock.balance.reverts();

      await tvlManager.addAssetAllocation(allocationId, data, symbol, decimals);

      await expect(tvlManager.balanceOf(allocationId)).to.be.reverted;
    });

    it("Revert on unregistered ID", async () => {
      const registeredId = bytes32("allocation 1");
      const unregisteredId = bytes32("allocation 2");
      const symbol = "FOO";
      const decimals = 18;
      const data = [FAKE_ADDRESS, bytes32("")];
      await tvlManager.addAssetAllocation(registeredId, data, symbol, decimals);

      await expect(tvlManager.balanceOf(unregisteredId)).to.be.revertedWith(
        "INVALID_ALLOCATION_ID"
      );
    });
  });

  it("symbolOf", async () => {
    const allocationId = bytes32("allocation 1");
    const data = [FAKE_ADDRESS, bytes32("")];
    const symbol = "FOO";
    const decimals = 18;
    await tvlManager.addAssetAllocation(allocationId, data, symbol, decimals);

    expect(await tvlManager.symbolOf(allocationId)).to.equal(symbol);
  });

  it("decimalsOf", async () => {
    const allocationId = bytes32("allocation 1");
    const data = [FAKE_ADDRESS, bytes32("")];
    const symbol = "FOO";
    const decimals = 18;
    await tvlManager.addAssetAllocation(allocationId, data, symbol, decimals);

    expect(await tvlManager.decimalsOf(allocationId)).to.equal(decimals);
  });
});
