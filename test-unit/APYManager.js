const { assert, expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, web3 } = hre;
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const ERC20 = artifacts.require("ERC20");
const IDetailedERC20 = new ethers.utils.Interface(
  artifacts.require("IDetailedERC20").abi
);
const erc20Interface = new ethers.utils.Interface(ERC20.abi);
const MockContract = artifacts.require("MockContract");

const bytes32 = ethers.utils.formatBytes32String;

describe("Contract: APYManager", async () => {
  // signers
  let deployer;
  let admin;
  let randomUser;
  let account1;

  // contract factories
  let APYManager;
  let APYManagerV2;
  let ProxyAdmin;
  let APYGenericExecutor;
  let Strategy;

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
    [deployer, admin, randomUser, account1] = await ethers.getSigners();

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

  describe("Test initialization", async () => {
    it("Revert when admin is zero address", async () => {
      let tempManager = await APYManager.new({ from: deployer });
      await expectRevert(tempManager.initialize(ZERO_ADDRESS), "INVALID_ADMIN");
    });
  });

  describe("Defaults", async () => {
    it("Owner is set to deployer", async () => {
      assert.equal(await manager.owner(), deployer);
    });
  });

  describe("Set metapool token", async () => {
    it("Test setting metapool token address as not owner", async () => {
      await expectRevert(
        manager.setMetaPoolToken(account1, { from: randomUser }),
        "revert Ownable: caller is not the owner"
      );
    });

    it("Test setting metapool token successfully", async () => {
      await manager.setMetaPoolToken(account1, { from: deployer });
      const mAptToken = await manager.mApt();
      assert.equal(mAptToken, account1);
    });
  });

  describe("Set address registry", async () => {
    it("Test setting address registry as 0x0 address", async () => {
      await expectRevert(
        manager.setAddressRegistry(ZERO_ADDRESS, { from: deployer }),
        "Invalid address"
      );
    });

    it("Test setting address registry as not owner", async () => {
      await expectRevert(
        manager.setAddressRegistry(account1, { from: randomUser }),
        "revert Ownable: caller is not the owner"
      );
    });

    it("Test setting address registry successfully", async () => {
      await manager.setAddressRegistry(account1, { from: deployer });
      const registry = await manager.addressRegistry();
      assert.equal(registry, account1);
    });
  });

  describe.skip("Test setting pool ids", async () => {
    it("Test setting pool ids by not owner", async () => {});
    it("Test setting pool ids successfully", async () => {});
  });

  describe("Setting admin address", async () => {
    it("Owner can set to valid address", async () => {
      await manager.setAdminAddress(randomUser, { from: deployer });
      const proxyAdmin = await manager.proxyAdmin();
      assert.equal(proxyAdmin, randomUser);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expectRevert(
        manager.setAdminAddress(admin, { from: randomUser }),
        "revert Ownable: caller is not the owner"
      );
    });

    it("Cannot set to zero address", async () => {
      await expectRevert(
        manager.setAdminAddress(ZERO_ADDRESS, { from: deployer }),
        "INVALID_ADMIN"
      );
    });
  });

  describe("Asset allocation", async () => {
    describe.skip("Temporary implementation for Chainlink", async () => {
      it("Set and get token addresses", async () => {
        assert.isEmpty(await manager.getTokenAddresses());

        const FAKE_ADDRESS_1 = web3.utils.toChecksumAddress(
          "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
        );
        const FAKE_ADDRESS_2 = web3.utils.toChecksumAddress(
          "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
        );
        const tokenAddresses = [FAKE_ADDRESS_1, FAKE_ADDRESS_2];
        await manager.setTokenAddresses(tokenAddresses);
        assert.deepEqual(await manager.getTokenAddresses(), tokenAddresses);
      });

      it("deleteTokenAddresses", async () => {
        const FAKE_ADDRESS_1 = web3.utils.toChecksumAddress(
          "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
        );
        const FAKE_ADDRESS_2 = web3.utils.toChecksumAddress(
          "0xBAADC0FFEEBAADC0FFEEBAADC0FFEEBAADC0FFEE"
        );
        const tokenAddresses = [FAKE_ADDRESS_1, FAKE_ADDRESS_2];
        await manager.setTokenAddresses(tokenAddresses);

        await manager.deleteTokenAddresses();
        assert.isEmpty(await manager.getTokenAddresses());
      });

      it("balanceOf", async () => {
        const mockRegistry = await MockContract.new();
        await manager.setAddressRegistry(mockRegistry.address);
        await manager.setPoolIds([bytes32("pool 1"), bytes32("pool 2")]);

        const mockToken = await MockContract.new();
        const balanceOf = IDetailedERC20.encodeFunctionData("balanceOf", [
          ZERO_ADDRESS,
        ]);
        await mockToken.givenMethodReturnUint(balanceOf, 1);

        const balance = await manager.balanceOf(mockToken.address);
        expect(balance).to.bignumber.equal("2");
      });
    });

    it("symbolOf", async () => {
      const mockToken = await MockContract.new();
      const symbol = IDetailedERC20.encodeFunctionData("symbol", []);
      const mockString = web3.eth.abi.encodeParameter("string", "MOCK");
      await mockToken.givenMethodReturn(symbol, mockString);

      assert.equal(await manager.symbolOf(mockToken.address), "MOCK");
    });
  });

  describe("Strategy factory", async () => {
    const encodedApprove = erc20Interface.encodeFunctionData(
      "approve(address,uint256)",
      [account1, 100]
    );
    let genericExecutor;
    let strategy;
    let TokenA;
    let TokenB;

    before("Deploy strategy", async () => {
      // NOTE: I use a real ERC20 contract here since MockContract cannot emit events
      TokenA = await ERC20.new("TokenA", "A");
      TokenB = await ERC20.new("TokenB", "B");

      genericExecutor = await APYGenericExecutor.new({ from: deployer });
      const strategyAddress = await manager.deployStrategy.call(
        genericExecutor.address,
        { from: deployer }
      );
      await manager.deployStrategy(genericExecutor.address, { from: deployer });
      strategy = await Strategy.at(strategyAddress);
    });

    it("Strategy owner is manager", async () => {
      const strategyOwner = await strategy.owner();
      assert.equal(strategyOwner, manager.address);
    });

    it("Fund strategy as not owner", async () => {
      await expectRevert(
        manager.fundStrategy(
          strategy.address,
          [
            [TokenA.address, TokenB.address],
            [0, 0],
          ],
          { from: randomUser }
        ),
        "revert Ownable: caller is not the owner"
      );
    });

    it("Fund an invalid strategy", async () => {
      await expectRevert(
        manager.fundStrategy(
          account1,
          [
            [TokenA.address, TokenB.address],
            [0, 0],
          ],
          { from: deployer }
        ),
        "Invalid Strategy"
      );
    });

    it.skip("Fund strategy as owner", async () => {
      // TESTED IN INTEGRATION TESTS
    });

    it("Fund and Execute as not owner", async () => {
      await expectRevert(
        manager.fundAndExecute(
          strategy.address,
          [
            [TokenA.address, TokenB.address],
            [0, 0],
          ],
          [
            [TokenA.address, encodedApprove],
            [TokenB.address, encodedApprove],
          ],
          { from: randomUser }
        ),
        "revert Ownable: caller is not the owner"
      );
    });

    it("Fund and Execute an invalid strategy", async () => {
      await expectRevert(
        manager.fundAndExecute(
          account1,
          [
            [TokenA.address, TokenB.address],
            [0, 0],
          ],
          [
            [TokenA.address, encodedApprove],
            [TokenB.address, encodedApprove],
          ],
          { from: deployer }
        ),
        "Invalid Strategy"
      );
    });

    it.skip("Fund and Execute as owner", async () => {
      // TESTED IN INTEGRATION TESTS
    });

    it("Execute as not owner", async () => {
      await expectRevert(
        manager.execute(
          strategy.address,
          [
            [TokenA.address, encodedApprove],
            [TokenB.address, encodedApprove],
          ],
          { from: randomUser }
        ),
        "revert Ownable: caller is not the owner"
      );
    });

    it("Execute as owner", async () => {
      const encodedApprove = erc20Interface.encodeFunctionData(
        "approve(address,uint256)",
        [account1, 100]
      );
      const trx = await manager.execute(
        strategy.address,
        [
          [TokenA.address, encodedApprove],
          [TokenB.address, encodedApprove],
        ],
        { from: deployer }
      );

      expectEvent.inTransaction(trx.tx, TokenA, "Approval", {
        owner: strategy.address,
        spender: account1,
        value: "100",
      });
      expectEvent.inTransaction(trx.tx, TokenB, "Approval", {
        owner: strategy.address,
        spender: account1,
        value: "100",
      });
    });

    it("Execute and Withdraw as not owner", async () => {
      await expectRevert(
        manager.executeAndWithdraw(
          strategy.address,
          [
            [TokenA.address, TokenB.address],
            [0, 0],
          ],
          [
            [TokenA.address, encodedApprove],
            [TokenB.address, encodedApprove],
          ],
          { from: randomUser }
        ),
        "revert Ownable: caller is not the owner"
      );
    });

    it("Execute and Withdraw from an invalid strategy", async () => {
      await expectRevert(
        manager.executeAndWithdraw(
          account1,
          [
            [TokenA.address, TokenB.address],
            [0, 0],
          ],
          [
            [TokenA.address, encodedApprove],
            [TokenB.address, encodedApprove],
          ],
          { from: deployer }
        ),
        "Invalid Strategy"
      );
    });

    it.skip("Execute Withdraw as owner", async () => {
      // TESTED IN INTEGRATION TESTS
    });

    it("Withdraw from strategy as not owner", async () => {
      await expectRevert(
        manager.withdrawFromStrategy(
          strategy.address,
          [
            [TokenA.address, TokenB.address],
            [0, 0],
          ],
          { from: randomUser }
        ),
        "revert Ownable: caller is not the owner"
      );
    });

    it("Withdraw from an invalid strategy", async () => {
      await expectRevert(
        manager.withdrawFromStrategy(
          account1,
          [
            [TokenA.address, TokenB.address],
            [0, 0],
          ],
          { from: deployer }
        ),
        "Invalid Strategy"
      );
    });

    it.skip("Withdraw from strategy as owner", async () => {
      // TESTED IN INTEGRATION TESTS
    });
  });

  describe("Token registration", async () => {
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
      expect(await manager.isTokenRegistered(tokenMock_3.address)).to.be.false;
    });

    describe("getTokenAddresses", async () => {
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
