const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
  tokenAmountToBigNumber,
  bytes32,
} = require("../utils/helpers");
const APYManagerV2 = artifacts.require("APYManagerV2");

describe.only("Contract: SequenceRegistry", () => {
  // signers
  let deployer;
  let randomUser;

  // contract factories
  let SequenceRegistry;
  let APYViewExecutor;

  // deployed contracts
  let registry;
  let executor;
  let managerMock;

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

    SequenceRegistry = await ethers.getContractFactory("SequenceRegistry");
    APYViewExecutor = await ethers.getContractFactory("APYViewExecutor");

    executor = await APYViewExecutor.deploy();
    await executor.deployed();

    managerMock = await deployMockContract(deployer, APYManagerV2.abi);

    registry = await SequenceRegistry.deploy(
      deployer.address,
      managerMock.address,
      executor.address
    );
    await registry.deployed();
  });

  describe("Defaults", () => {
    it("Owner is set to deployer", async () => {
      expect(await registry.owner()).to.equal(deployer.address);
    });
  });

  describe("Setting admin address", () => {
    it("Owner can set to valid address", async () => {
      await registry.connect(deployer).setAdminAddress(FAKE_ADDRESS);
      expect(await registry.proxyAdmin()).to.equal(FAKE_ADDRESS);
    });

    it("Non-owner cannot set", async () => {
      await expect(
        registry.connect(randomUser).setAdminAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        registry.connect(deployer).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });
  });

  describe("Token registration", () => {
    describe("addSequence", async () => {
      it("Non-owner cannot call", async () => {
        const sequenceId = bytes32("");
        const data = [];
        const symbol = "FOO";
        await expect(
          registry.connect(randomUser).addSequence(sequenceId, data, symbol)
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Owner can call", async () => {
        const sequenceId = bytes32("");
        const data = [];
        const symbol = "FOO";
        await expect(
          registry.connect(deployer).addSequence(sequenceId, data, symbol)
        ).to.not.be.reverted;
      });
    });

    describe("deregisterTokens", async () => {
      it("Non-owner cannot call", async () => {
        const sequenceId = bytes32("");
        await expect(
          registry.connect(randomUser).removeSequence(sequenceId)
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Owner can call", async () => {
        const sequenceId = bytes32("");
        await expect(registry.connect(deployer).removeSequence(sequenceId)).to
          .not.be.reverted;
      });
    });

    it("isSequenceRegistered", async () => {
      const sequenceId_1 = bytes32("sequence 1");
      const sequenceId_2 = bytes32("sequence 2");
      const data = [];
      const symbol = "FOO";
      await registry.addSequence(sequenceId_1, data, symbol);

      expect(await registry.isSequenceRegistered(sequenceId_1)).to.be.true;
      expect(await registry.isSequenceRegistered(sequenceId_2)).to.be.false;
    });

    describe("getSequenceIds", () => {
      it("Retrieves single registered sequence", async () => {
        const sequenceId = bytes32("sequence 1");
        const data = [];
        const symbol = "FOO";
        const sequenceIds = [sequenceId];
        await registry.addSequence(sequenceId, data, symbol);

        expect(await registry.getSequenceIds()).to.have.members(sequenceIds);
        expect(await registry.getSequenceIds()).to.have.lengthOf(
          sequenceIds.length
        );
      });

      it("Does not return duplicates", async () => {
        const sequenceId_1 = bytes32("sequence 1");
        const sequenceId_2 = bytes32("sequence 2");
        const data = [];
        const symbol = "FOO";
        await registry.addSequence(sequenceId_1, data, symbol);
        await registry.addSequence(sequenceId_2, data, symbol);
        await registry.addSequence(sequenceId_1, data, symbol);

        const expectedSequenceIds = [sequenceId_1, sequenceId_2];
        expect(await registry.getSequenceIds()).to.have.members(
          expectedSequenceIds
        );
        expect(await registry.getSequenceIds()).to.have.lengthOf(
          expectedSequenceIds.length
        );
      });

      it("Does not retrieve deregistered sequences", async () => {
        const sequenceId_1 = bytes32("sequence 1");
        const sequenceId_2 = bytes32("sequence 2");
        const sequenceId_3 = bytes32("sequence 3");
        const data = [];
        const symbol = "FOO";

        const deregisteredIds = [sequenceId_1];
        const leftoverIds = [sequenceId_2, sequenceId_3];
        const sequenceIds = deregisteredIds.concat(leftoverIds);

        for (const id of sequenceIds) {
          await registry.addSequence(id, data, symbol);
        }
        for (const id of deregisteredIds) {
          await registry.removeSequence(id);
        }

        expect(await registry.getSequenceIds()).to.have.members(leftoverIds);
        expect(await registry.getSequenceIds()).to.have.lengthOf(
          leftoverIds.length
        );
      });

      it("Returns sequences still registered after deregistration", async () => {
        const sequenceId_1 = bytes32("sequence 1");
        const sequenceId_2 = bytes32("sequence 2");
        const sequenceId_3 = bytes32("sequence 3");
        const data = [];
        const symbol = "FOO";
        for (const id of [sequenceId_1, sequenceId_2, sequenceId_3]) {
          await registry.addSequence(id, data, symbol);
        }

        await registry.removeSequence(sequenceId_3);
        expect(await registry.getSequenceIds()).to.not.include(sequenceId_3);
        expect(await registry.getSequenceIds()).to.have.lengthOf(2);

        await registry.removeSequence(sequenceId_1);
        expect(await registry.getSequenceIds()).to.have.lengthOf(1);
        expect(await registry.getSequenceIds()).to.have.members([sequenceId_2]);
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
      const data = [[peripheryContract.address, encodedBalance]];
      // step execution should return a value
      const expectedBalance = tokenAmountToBigNumber(100);
      await peripheryContract.mock.balance
        .withArgs(strategy)
        .returns(expectedBalance);

      await registry.addSequence(sequenceId, data, symbol);

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
      const data = [[peripheryContract.address, encodedBalance]];
      // step execution will revert
      await peripheryContract.mock.balance.reverts();

      await registry.addSequence(sequenceId, data, symbol);

      await expect(registry.balanceOf(sequenceId)).to.be.reverted;
    });

    it("Multiple calls", async () => {
      const sequenceId = bytes32("sequence 1");
      const symbol = "FOO";
      const strategy = FAKE_ADDRESS;
      // create the step to execute
      const iface = new ethers.utils.Interface(peripheryAbi);
      const encodedBalance = iface.encodeFunctionData(
        "isStrategyDeployed(address)",
        [strategy]
      );
      const data = [[peripheryContract.address, encodedBalance]];
      // step execution will revert
      await peripheryContract.mock.balance.reverts();
    });
  });

  it("symbolOf", async () => {
    const sequenceId = bytes32("sequence 1");
    const data = [];
    const symbol = "FOO";
    await registry.addSequence(sequenceId, data, symbol);

    expect(await registry.symbolOf(sequenceId)).to.equal(symbol);
  });
});
