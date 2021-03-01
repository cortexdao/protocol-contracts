const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  FAKE_ADDRESS,
  expectEventInTransaction,
  ANOTHER_FAKE_ADDRESS,
  tokenAmountToBigNumber,
  bytes32,
} = require("../utils/helpers");
const IDetailedERC20 = artifacts.require("IDetailedERC20");
const erc20Interface = new ethers.utils.Interface(
  artifacts.require("ERC20").abi
);

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

    registry = await SequenceRegistry.deploy();
    await registry.deployed();

    executor = await APYViewExecutor.deploy();
    await executor.deployed();

    managerMock = await deployMockContract(deployer, []);

    await registry.initialize(
      deployer.address,
      managerMock.address,
      executor.address
    );
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

  describe("Asset allocation", () => {
    let peripheryContract;

    before(async () => {
      peripheryContract = await deployMockContract(deployer, [
        {
          inputs: [],
          name: "balance",
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
        {
          inputs: [],
          name: "symbol",
          outputs: [
            {
              internalType: "string",
              name: "",
              type: "string",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
      ]);
    });

    describe("Token registration", () => {
      let strategy;

      before(async () => {
        //
      });

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

        it("Returns tokens registered with multiple strategies", async () => {
          // deploy another strategy
          const strategy_2 = await registry.callStatic.deployStrategy(
            executor.address
          );
          await registry.deployStrategy(executor.address);

          // register with 1st strategy
          const tokenMock_1 = await deployMockContract(deployer, []);
          const tokenMock_2 = await deployMockContract(deployer, []);
          const tokens = [tokenMock_1.address, tokenMock_2.address];
          await registry.registerTokens(strategy, tokens);

          // register with 2nd strategy
          const tokenMock_3 = await deployMockContract(deployer, []);
          const moreTokens = [tokenMock_2.address, tokenMock_3.address]; // note duplicate
          await registry.registerTokens(strategy_2, moreTokens);

          const expectedTokens = [
            tokenMock_1.address,
            tokenMock_2.address,
            tokenMock_3.address,
          ];
          expect(await registry.getTokenAddresses()).to.have.members(
            expectedTokens
          );
          expect(await registry.getTokenAddresses()).to.have.lengthOf(
            expectedTokens.length
          );
        });

        it("Does not retrieve deregistered tokens", async () => {
          const tokenMock_1 = await deployMockContract(deployer, []);
          const tokenMock_2 = await deployMockContract(deployer, []);
          const tokenMock_3 = await deployMockContract(deployer, []);

          const deregisteredTokens = [tokenMock_1.address];
          const leftoverTokens = [tokenMock_2.address, tokenMock_3.address];
          const tokens = deregisteredTokens.concat(leftoverTokens);

          await registry.registerTokens(strategy, tokens);
          await registry.deregisterTokens(strategy, deregisteredTokens);

          expect(await registry.getTokenAddresses()).to.have.members(
            leftoverTokens
          );
          expect(await registry.getTokenAddresses()).to.have.lengthOf(
            leftoverTokens.length
          );
        });

        it("Returns tokens still registered after deregistration", async () => {
          // deploy another strategy
          const strategy_2 = await registry.callStatic.deployStrategy(
            executor.address
          );
          await registry.deployStrategy(executor.address);

          const tokenMock_1 = await deployMockContract(deployer, []);
          const tokenMock_2 = await deployMockContract(deployer, []);
          const tokenMock_3 = await deployMockContract(deployer, []);

          await registry.registerTokens(strategy, [
            tokenMock_1.address,
            tokenMock_2.address,
            tokenMock_3.address,
          ]);
          await registry.registerTokens(strategy_2, [
            tokenMock_1.address,
            tokenMock_2.address,
          ]);

          await registry.deregisterTokens(strategy, [tokenMock_3.address]);
          expect(await registry.getTokenAddresses()).to.not.include(
            tokenMock_3.address
          );
          expect(await registry.getTokenAddresses()).to.have.lengthOf(2);

          await registry.deregisterTokens(strategy, [tokenMock_1.address]);
          await registry.deregisterTokens(strategy_2, [tokenMock_1.address]);
          expect(await registry.getTokenAddresses()).to.have.lengthOf(1);
          expect(await registry.getTokenAddresses()).to.have.members([
            tokenMock_2.address,
          ]);
        });
      });
    });

    // describe("balanceOf", async () => {
    //   it("Single strategy and token", async () => {
    //     const strategy = await registry.callStatic.deployStrategy(
    //       executor.address
    //     );
    //     await registry.deployStrategy(executor.address);

    //     const mockToken = await deployMockContract(
    //       deployer,
    //       IDetailedERC20.abi
    //     );
    //     const expectedBalance = "129387";
    //     await mockToken.mock.balanceOf.returns(expectedBalance);

    //     await registry.registerTokens(strategy, [mockToken.address]);

    //     const balance = await registry.balanceOf(mockToken.address);
    //     expect(balance).to.equal(expectedBalance);
    //   });

    //   it("Multiple strategies", async () => {
    //     const strategy_1 = await registry.callStatic.deployStrategy(
    //       executor.address
    //     );
    //     await registry.deployStrategy(executor.address);
    //     const strategy_2 = await registry.callStatic.deployStrategy(
    //       executor.address
    //     );
    //     await registry.deployStrategy(executor.address);

    //     const mockToken = await deployMockContract(
    //       deployer,
    //       IDetailedERC20.abi
    //     );
    //     const balance_1 = tokenAmountToBigNumber("129382");
    //     const balance_2 = tokenAmountToBigNumber("298");
    //     await mockToken.mock.balanceOf.withArgs(strategy_1).returns(balance_1);
    //     await mockToken.mock.balanceOf.withArgs(strategy_2).returns(balance_2);
    //     const expectedBalance = balance_1.add(balance_2);

    //     await registry.registerTokens(strategy_1, [mockToken.address]);
    //     await registry.registerTokens(strategy_2, [mockToken.address]);

    //     expect(await registry.balanceOf(mockToken.address)).to.equal(
    //       expectedBalance
    //     );
    //   });

    //   it("Multiple strategies and multiple tokens", async () => {
    //     const strategy_1 = await registry.callStatic.deployStrategy(
    //       executor.address
    //     );
    //     await registry.deployStrategy(executor.address);
    //     const strategy_2 = await registry.callStatic.deployStrategy(
    //       executor.address
    //     );
    //     await registry.deployStrategy(executor.address);

    //     const token_a = await deployMockContract(deployer, IDetailedERC20.abi);
    //     const balance_a_1 = tokenAmountToBigNumber("129382");
    //     const balance_a_2 = tokenAmountToBigNumber("0");
    //     await token_a.mock.balanceOf.withArgs(strategy_1).returns(balance_a_1);
    //     await token_a.mock.balanceOf.withArgs(strategy_2).returns(balance_a_2);
    //     const expectedBalance_a = balance_a_1.add(balance_a_2);

    //     const token_b = await deployMockContract(deployer, IDetailedERC20.abi);
    //     const balance_b_1 = tokenAmountToBigNumber("0");
    //     const balance_b_2 = tokenAmountToBigNumber("9921");
    //     await token_b.mock.balanceOf.withArgs(strategy_1).returns(balance_b_1);
    //     await token_b.mock.balanceOf.withArgs(strategy_2).returns(balance_b_2);
    //     const expectedBalance_b = balance_b_1.add(balance_b_2);

    //     const token_c = await deployMockContract(deployer, IDetailedERC20.abi);
    //     const balance_c_1 = tokenAmountToBigNumber("2812");
    //     const balance_c_2 = tokenAmountToBigNumber("678123");
    //     await token_c.mock.balanceOf.withArgs(strategy_1).returns(balance_c_1);
    //     await token_c.mock.balanceOf.withArgs(strategy_2).returns(balance_c_2);
    //     const expectedBalance_c = balance_c_1.add(balance_c_2);

    //     const tokens = [token_a.address, token_b.address, token_c.address];

    //     await registry.registerTokens(strategy_1, tokens);
    //     await registry.registerTokens(strategy_2, tokens);

    //     expect(await registry.balanceOf(token_a.address)).to.equal(
    //       expectedBalance_a
    //     );
    //     expect(await registry.balanceOf(token_b.address)).to.equal(
    //       expectedBalance_b
    //     );
    //     expect(await registry.balanceOf(token_c.address)).to.equal(
    //       expectedBalance_c
    //     );
    //   });
    // });

    // it("symbolOf", async () => {
    //   const mockToken = await deployMockContract(deployer, IDetailedERC20.abi);
    //   await mockToken.mock.symbol.returns("MOCK");
    //   expect(await registry.symbolOf(mockToken.address)).to.equal("MOCK");
    // });
  });
});
