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
} = require("../utils/helpers");
const IDetailedERC20 = artifacts.require("IDetailedERC20");
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
    let poolA;
    let poolB;

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
      poolA = await deployMockContract(deployer, []);
      poolB = await deployMockContract(deployer, []);

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
          manager.connect(randomUser).fundStrategy(strategy.address, [
            [poolA.address, poolB.address],
            [0, 0],
          ])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on invalid strategy", async () => {
        await expect(
          manager.fundStrategy(FAKE_ADDRESS, [
            [poolA.address, poolB.address],
            [0, 0],
          ])
        ).to.be.revertedWith("Invalid Strategy");
      });

      it.skip("Owner can call", async () => {
        // TESTED IN INTEGRATION TESTS
      });
    });

    describe("fundAndExecute", () => {
      it("Non-owner cannot call", async () => {
        await expect(
          manager.connect(randomUser).fundAndExecute(
            strategy.address,
            [
              [poolA.address, poolB.address],
              [0, 0],
            ],
            [
              [tokenA.address, encodedApprove],
              [tokenB.address, encodedApprove],
            ]
          )
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on invalid strategy", async () => {
        await expect(
          manager.fundAndExecute(
            FAKE_ADDRESS,
            [
              [poolA.address, poolB.address],
              [0, 0],
            ],
            [
              [tokenA.address, encodedApprove],
              [tokenB.address, encodedApprove],
            ]
          )
        ).to.be.revertedWith("Invalid Strategy");
      });

      it.skip("Owner can call", async () => {
        // TESTED IN INTEGRATION TESTS
      });
    });

    describe("execute", () => {
      it("Non-owner cannot call", async () => {
        await expect(
          manager.connect(randomUser).execute(strategy.address, [
            [tokenA.address, encodedApprove],
            [tokenB.address, encodedApprove],
          ])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Owner can call", async () => {
        const trx = await manager.execute(strategy.address, [
          [tokenA.address, encodedApprove],
          [tokenB.address, encodedApprove],
        ]);

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
          manager.connect(randomUser).executeAndWithdraw(
            strategy.address,
            [
              [poolA.address, poolB.address],
              [0, 0],
            ],
            [
              [tokenA.address, encodedApprove],
              [tokenB.address, encodedApprove],
            ]
          )
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on invalid strategy", async () => {
        await expect(
          manager.executeAndWithdraw(
            FAKE_ADDRESS,
            [
              [poolA.address, poolB.address],
              [0, 0],
            ],
            [
              [tokenA.address, encodedApprove],
              [tokenB.address, encodedApprove],
            ]
          )
        ).to.be.revertedWith("Invalid Strategy");
      });

      it.skip("Owner can call", async () => {
        // TESTED IN INTEGRATION TESTS
      });
    });

    describe("withdrawFromStrategy", () => {
      it("Non-owner cannot call", async () => {
        await expect(
          manager.connect(randomUser).withdrawFromStrategy(strategy.address, [
            [poolA.address, poolB.address],
            [0, 0],
          ])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Revert on invalid strategy", async () => {
        await expect(
          manager.withdrawFromStrategy(FAKE_ADDRESS, [
            [poolA.address, poolB.address],
            [0, 0],
          ])
        ).to.be.revertedWith("Invalid Strategy");
      });

      it.skip("Owner can call", async () => {
        // TESTED IN INTEGRATION TESTS
      });
    });
  });

  describe("Asset allocation", () => {
    describe.only("balanceOf", async () => {
      it("Single strategy and token", async () => {
        const strategy = await manager.callStatic.deployStrategy(
          executor.address
        );
        await manager.deployStrategy(executor.address);

        const mockToken = await deployMockContract(
          deployer,
          IDetailedERC20.abi
        );
        const expectedBalance = "129387";
        await mockToken.mock.balanceOf.returns(expectedBalance);

        await manager.registerTokens(strategy, [mockToken.address]);

        const balance = await manager.balanceOf(mockToken.address);
        expect(balance).to.equal(expectedBalance);
      });

      it("Multiple strategies", async () => {
        const strategy_1 = await manager.callStatic.deployStrategy(
          executor.address
        );
        await manager.deployStrategy(executor.address);
        const strategy_2 = await manager.callStatic.deployStrategy(
          executor.address
        );
        await manager.deployStrategy(executor.address);

        const mockToken = await deployMockContract(
          deployer,
          IDetailedERC20.abi
        );
        const balance_1 = tokenAmountToBigNumber("129382");
        const balance_2 = tokenAmountToBigNumber("298");
        await mockToken.mock.balanceOf.withArgs(strategy_1).returns(balance_1);
        await mockToken.mock.balanceOf.withArgs(strategy_2).returns(balance_2);
        const expectedBalance = balance_1.add(balance_2);

        await manager.registerTokens(strategy_1, [mockToken.address]);
        await manager.registerTokens(strategy_2, [mockToken.address]);

        expect(await manager.balanceOf(mockToken.address)).to.equal(
          expectedBalance
        );
      });

      it("Multiple strategies and multiple tokens", async () => {
        const strategy_1 = await manager.callStatic.deployStrategy(
          executor.address
        );
        await manager.deployStrategy(executor.address);
        const strategy_2 = await manager.callStatic.deployStrategy(
          executor.address
        );
        await manager.deployStrategy(executor.address);

        const token_a = await deployMockContract(deployer, IDetailedERC20.abi);
        const balance_a_1 = tokenAmountToBigNumber("129382");
        const balance_a_2 = tokenAmountToBigNumber("0");
        await token_a.mock.balanceOf.withArgs(strategy_1).returns(balance_a_1);
        await token_a.mock.balanceOf.withArgs(strategy_2).returns(balance_a_2);
        const expectedBalance_a = balance_a_1.add(balance_a_2);

        const token_b = await deployMockContract(deployer, IDetailedERC20.abi);
        const balance_b_1 = tokenAmountToBigNumber("0");
        const balance_b_2 = tokenAmountToBigNumber("9921");
        await token_b.mock.balanceOf.withArgs(strategy_1).returns(balance_b_1);
        await token_b.mock.balanceOf.withArgs(strategy_2).returns(balance_b_2);
        const expectedBalance_b = balance_b_1.add(balance_b_2);

        const token_c = await deployMockContract(deployer, IDetailedERC20.abi);
        const balance_c_1 = tokenAmountToBigNumber("2812");
        const balance_c_2 = tokenAmountToBigNumber("678123");
        await token_c.mock.balanceOf.withArgs(strategy_1).returns(balance_c_1);
        await token_c.mock.balanceOf.withArgs(strategy_2).returns(balance_c_2);
        const expectedBalance_c = balance_c_1.add(balance_c_2);

        const tokens = [token_a.address, token_b.address, token_c.address];

        await manager.registerTokens(strategy_1, tokens);
        await manager.registerTokens(strategy_2, tokens);

        expect(await manager.balanceOf(token_a.address)).to.equal(
          expectedBalance_a
        );
        expect(await manager.balanceOf(token_b.address)).to.equal(
          expectedBalance_b
        );
        expect(await manager.balanceOf(token_c.address)).to.equal(
          expectedBalance_c
        );
      });
    });

    it("symbolOf", async () => {
      const mockToken = await deployMockContract(deployer, IDetailedERC20.abi);
      await mockToken.mock.symbol.returns("MOCK");
      expect(await manager.symbolOf(mockToken.address)).to.equal("MOCK");
    });

    describe("Token registration", () => {
      let strategy;

      before(async () => {
        strategy = await manager.callStatic.deployStrategy(executor.address);
        await manager.deployStrategy(executor.address);
      });

      describe("registerTokens", async () => {
        it("Can register for deployed strategy", async () => {
          const tokens = [];
          await expect(manager.registerTokens(strategy, tokens)).to.not.be
            .reverted;
        });

        it("Revert when registering for non-deployed address", async () => {
          const tokens = [];
          await expect(
            manager.registerTokens(FAKE_ADDRESS, tokens)
          ).to.be.revertedWith("INVALID_STRATEGY");
        });
      });

      it("isTokenRegistered", async () => {
        const tokenMock_1 = await deployMockContract(deployer, []);
        const tokenMock_2 = await deployMockContract(deployer, []);
        const tokenMock_3 = await deployMockContract(deployer, []);
        const tokens = [tokenMock_1.address, tokenMock_2.address];
        await manager.registerTokens(strategy, tokens);

        expect(await manager.isTokenRegistered(tokenMock_1.address)).to.be.true;
        expect(await manager.isTokenRegistered(tokenMock_2.address)).to.be.true;
        expect(await manager.isTokenRegistered(tokenMock_3.address)).to.be
          .false;
      });

      describe("getTokenAddresses", () => {
        it("retrieves registered tokens", async () => {
          const tokenMock_1 = await deployMockContract(deployer, []);
          const tokenMock_2 = await deployMockContract(deployer, []);
          const tokens = [tokenMock_1.address, tokenMock_2.address];
          await manager.registerTokens(strategy, tokens);

          expect(await manager.getTokenAddresses()).to.have.members(tokens);
          expect(await manager.getTokenAddresses()).to.have.lengthOf(
            tokens.length
          );
        });

        it("Does not return duplicates", async () => {
          const tokenMock_1 = await deployMockContract(deployer, []);
          const tokenMock_2 = await deployMockContract(deployer, []);
          const tokenMock_3 = await deployMockContract(deployer, []);
          const tokenMock_4 = await deployMockContract(deployer, []);
          const tokenMock_5 = await deployMockContract(deployer, []);

          await manager.registerTokens(strategy, [
            tokenMock_1.address,
            tokenMock_2.address,
          ]);
          await manager.registerTokens(strategy, [tokenMock_3.address]);
          await manager.registerTokens(strategy, [
            tokenMock_2.address,
            tokenMock_4.address,
          ]);
          await manager.registerTokens(strategy, [
            tokenMock_1.address,
            tokenMock_3.address,
          ]);
          await manager.registerTokens(strategy, [tokenMock_5.address]);

          const expectedTokens = [
            tokenMock_1.address,
            tokenMock_2.address,
            tokenMock_3.address,
            tokenMock_4.address,
            tokenMock_5.address,
          ];
          expect(await manager.getTokenAddresses()).to.have.members(
            expectedTokens
          );
          expect(await manager.getTokenAddresses()).to.have.lengthOf(
            expectedTokens.length
          );
        });

        it("Returns tokens from multiple strategies", async () => {
          // deploy another strategy
          const strategy_2 = await manager.callStatic.deployStrategy(
            executor.address
          );
          await manager.deployStrategy(executor.address);

          // register with 1st strategy
          const tokenMock_1 = await deployMockContract(deployer, []);
          const tokenMock_2 = await deployMockContract(deployer, []);
          const tokens = [tokenMock_1.address, tokenMock_2.address];
          await manager.registerTokens(strategy, tokens);

          // register with 2nd strategy
          const tokenMock_3 = await deployMockContract(deployer, []);
          const moreTokens = [tokenMock_2.address, tokenMock_3.address];
          await manager.registerTokens(strategy_2, moreTokens);

          const expectedTokens = [
            tokenMock_1.address,
            tokenMock_2.address,
            tokenMock_3.address,
          ];
          expect(await manager.getTokenAddresses()).to.have.members(
            expectedTokens
          );
          expect(await manager.getTokenAddresses()).to.have.lengthOf(
            expectedTokens.length
          );
        });
      });
    });
  });
});
