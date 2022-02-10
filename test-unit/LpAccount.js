const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  FAKE_ADDRESS,
  bytes32,
  tokenAmountToBigNumber,
  deepEqual,
  MAX_UINT256,
  ZERO_ADDRESS,
} = require("../utils/helpers");

const IAddressRegistryV2 = artifacts.readArtifactSync("IAddressRegistryV2");
const TvlManager = artifacts.readArtifactSync("TvlManager");
const Erc20Allocation = artifacts.readArtifactSync("Erc20Allocation");
const OracleAdapter = artifacts.readArtifactSync("OracleAdapter");

async function generateContractAddress() {
  const [deployer] = await ethers.getSigners();
  const contract = await deployMockContract(deployer, []);
  return contract.address;
}

async function deployMockZap(name) {
  const TestZap = await ethers.getContractFactory("TestZap");
  const zap = await TestZap.deploy(name || "mockZap");
  return zap;
}

async function deployMockSwap(name) {
  const TestSwap = await ethers.getContractFactory("TestSwap");
  const swap = await TestSwap.deploy(name || "mockSwap");
  return swap;
}

describe.only("Contract: LpAccount", () => {
  // signers
  let deployer;
  let lpSafe;
  let emergencySafe;
  let adminSafe;
  let treasurySafe;
  let mApt;
  let randomUser;

  // deployed contracts
  let lpAccount;
  let proxyAdmin;
  // mocks
  let addressRegistry;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [
      deployer,
      lpAccount,
      lpSafe,
      emergencySafe,
      adminSafe,
      treasurySafe,
      mApt,
      randomUser,
    ] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      IAddressRegistryV2.abi
    );

    // These registered addresses are setup for roles in the
    // constructor for LpAccount
    await addressRegistry.mock.lpAccountAddress.returns(lpAccount.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.mAptAddress.returns(mApt.address);
    // Needed for the `claim` function, which uses the Treasury Safe as
    // recipient for collected fees.
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("treasurySafe"))
      .returns(treasurySafe.address);

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    proxyAdmin = await ProxyAdmin.deploy();

    const LpAccount = await ethers.getContractFactory("TestLpAccount");
    const logicV1 = await LpAccount.deploy();

    const initData = LpAccount.interface.encodeFunctionData(
      "initialize(address)",
      [addressRegistry.address]
    );

    const TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    const proxy = await TransparentUpgradeableProxy.deploy(
      logicV1.address,
      proxyAdmin.address,
      initData
    );

    const LpAccountV2 = await ethers.getContractFactory("TestLpAccountV2");
    const logicV2 = await LpAccountV2.deploy();
    const initV2Data = LpAccountV2.interface.encodeFunctionData(
      "initializeUpgrade()",
      []
    );
    await proxyAdmin.upgradeAndCall(proxy.address, logicV2.address, initV2Data);

    lpAccount = await LpAccountV2.attach(proxy.address);
  });

  describe("V1 Initialization", () => {
    let logic;
    let LpAccount;

    before(async () => {
      LpAccount = await ethers.getContractFactory("TestLpAccount");
      logic = await LpAccount.deploy();
    });

    it("Allow when address registry is a contract address", async () => {
      await expect(logic.initialize(addressRegistry.address)).to.not.be
        .reverted;
    });

    it("Revert when address registry is not a contract address", async () => {
      await expect(logic.initialize(FAKE_ADDRESS)).to.be.revertedWith(
        "INVALID_ADDRESS"
      );
    });

    it("Revert when called twice", async () => {
      await expect(logic.initialize(addressRegistry.address)).to.not.be
        .reverted;
      await expect(
        logic.initialize(addressRegistry.address)
      ).to.be.revertedWith("Contract instance has already been initialized");
    });

    it("Proxy admin can call `initializeUpgrade` during upgrade", async () => {
      const initData = LpAccount.interface.encodeFunctionData(
        "initializeUpgrade()",
        []
      );
      await expect(
        proxyAdmin
          .connect(deployer)
          .upgradeAndCall(lpAccount.address, logic.address, initData)
      ).to.not.be.reverted;
    });

    it("Revert when non-admin attempts `initializeUpgrade`", async () => {
      // need to initialize before calling `initializeUpgrade`
      await logic.initialize(addressRegistry.address);
      await expect(logic.initializeUpgrade()).to.be.revertedWith(
        "PROXY_ADMIN_ONLY"
      );
    });
  });

  describe("V2 Initialization", () => {
    let logic;
    let LpAccountV2;

    before(async () => {
      LpAccountV2 = await ethers.getContractFactory("TestLpAccountV2");
      logic = await LpAccountV2.deploy();
    });

    it("Allow when address registry is a contract address", async () => {
      await expect(logic.initialize(addressRegistry.address)).to.not.be
        .reverted;
    });

    it("Revert when address registry is not a contract address", async () => {
      await expect(logic.initialize(FAKE_ADDRESS)).to.be.revertedWith(
        "INVALID_ADDRESS"
      );
    });

    it("Revert when called twice", async () => {
      await expect(logic.initialize(addressRegistry.address)).to.not.be
        .reverted;
      await expect(
        logic.initialize(addressRegistry.address)
      ).to.be.revertedWith("Contract instance has already been initialized");
    });

    it("Proxy admin can call `initializeUpgrade` during upgrade", async () => {
      const initData = LpAccountV2.interface.encodeFunctionData(
        "initializeUpgrade()",
        []
      );
      await expect(
        proxyAdmin
          .connect(deployer)
          .upgradeAndCall(lpAccount.address, logic.address, initData)
      ).to.not.be.reverted;
    });

    it("Revert when non-admin attempts `initializeUpgrade`", async () => {
      // need to initialize before calling `initializeUpgrade`
      await logic.initialize(addressRegistry.address);
      await expect(logic.initializeUpgrade()).to.be.revertedWith(
        "PROXY_ADMIN_ONLY"
      );
    });
  });

  describe("Defaults", () => {
    it("Cannot call `initialize` after deploy", async () => {
      await expect(
        lpAccount.initialize(addressRegistry.address)
      ).to.be.revertedWith("Contract instance has already been initialized");
    });

    it("Default admin role given to Emergency Safe", async () => {
      const DEFAULT_ADMIN_ROLE = await lpAccount.DEFAULT_ADMIN_ROLE();
      const memberCount = await lpAccount.getRoleMemberCount(
        DEFAULT_ADMIN_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(await lpAccount.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address))
        .to.be.true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await lpAccount.EMERGENCY_ROLE();
      const memberCount = await lpAccount.getRoleMemberCount(EMERGENCY_ROLE);
      expect(memberCount).to.equal(1);
      expect(await lpAccount.hasRole(EMERGENCY_ROLE, emergencySafe.address)).to
        .be.true;
    });

    it("Admin role given to Admin Safe", async () => {
      const ADMIN_ROLE = await lpAccount.ADMIN_ROLE();
      const memberCount = await lpAccount.getRoleMemberCount(ADMIN_ROLE);
      expect(memberCount).to.equal(1);
      expect(await lpAccount.hasRole(ADMIN_ROLE, adminSafe.address)).to.be.true;
    });

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await lpAccount.LP_ROLE();
      const memberCount = await lpAccount.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await lpAccount.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });

    it("Contract role given to MetaPoolToken", async () => {
      const CONTRACT_ROLE = await lpAccount.CONTRACT_ROLE();
      const memberCount = await lpAccount.getRoleMemberCount(CONTRACT_ROLE);
      expect(memberCount).to.equal(1);
      expect(await lpAccount.hasRole(CONTRACT_ROLE, mApt.address)).to.be.true;
    });

    it("proxyAdmin was set", async () => {
      expect(await lpAccount.proxyAdmin()).to.equal(proxyAdmin.address);
    });

    it("addressRegistry was set", async () => {
      expect(await lpAccount.addressRegistry()).to.equal(
        addressRegistry.address
      );
    });
  });

  describe("emergencySetAddressRegistry", () => {
    it("Emergency Safe can call", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await expect(
        lpAccount
          .connect(emergencySafe)
          .emergencySetAddressRegistry(someContractAddress)
      ).to.not.be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await expect(
        lpAccount
          .connect(randomUser)
          .emergencySetAddressRegistry(someContractAddress)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Address can be set", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await lpAccount
        .connect(emergencySafe)
        .emergencySetAddressRegistry(someContractAddress);
      expect(await lpAccount.addressRegistry()).to.equal(someContractAddress);
    });

    it("Cannot set to non-contract address", async () => {
      await expect(
        lpAccount
          .connect(emergencySafe)
          .emergencySetAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });
  });

  describe("setLockPeriod", () => {
    it("Admin Safe can call", async () => {
      const lockPeriod = 100;
      await expect(lpAccount.connect(adminSafe).setLockPeriod(lockPeriod)).to
        .not.be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      const lockPeriod = 100;
      await expect(
        lpAccount.connect(randomUser).setLockPeriod(lockPeriod)
      ).to.be.revertedWith("NOT_ADMIN_ROLE");
    });

    it("Lock period can be set", async () => {
      const lockPeriod = 100;
      await lpAccount.connect(adminSafe).setLockPeriod(lockPeriod);
      expect(await lpAccount.lockPeriod()).to.equal(lockPeriod);
    });
  });

  describe("_lockOracleAdapter", () => {
    let oracleAdapter;

    before("Mock oracle adapter", async () => {
      oracleAdapter = await deployMockContract(
        deployer,
        artifacts.readArtifactSync("OracleAdapter").abi
      );

      await addressRegistry.mock.oracleAdapterAddress.returns(
        oracleAdapter.address
      );
    });

    it("Delegates properly to adapter", async () => {
      const lockPeriod = 112;
      await oracleAdapter.mock.lockFor.reverts();
      await oracleAdapter.mock.lockFor.withArgs(lockPeriod).returns();
      await expect(lpAccount.testLockOracleAdapter(lockPeriod)).to.not.be
        .reverted;
    });

    it("Does not revert when adapter reverts with shorten lock reason", async () => {
      await oracleAdapter.mock.lockFor.revertsWithReason("CANNOT_SHORTEN_LOCK");
      await expect(lpAccount.testLockOracleAdapter(100)).to.not.be.reverted;
    });

    it("Bubbles up any other revert from the adapter", async () => {
      await oracleAdapter.mock.lockFor.revertsWithReason(
        "UNEXPECTED_BAD_THING"
      );
      await expect(lpAccount.testLockOracleAdapter(100)).to.be.revertedWith(
        "UNEXPECTED_BAD_THING"
      );
    });
  });

  describe("Zaps", () => {
    describe("registerZap", () => {
      it("Admin Safe can call", async () => {
        const zap = await deployMockZap();
        await expect(lpAccount.connect(adminSafe).registerZap(zap.address)).to
          .not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        const zap = await deployMockZap();
        await expect(
          lpAccount.connect(randomUser).registerZap(zap.address)
        ).to.be.revertedWith("NOT_ADMIN_ROLE");
      });

      it("can register", async () => {
        expect(await lpAccount.zapNames()).to.be.empty;

        const zap = await deployMockZap();
        const name = await zap.NAME();
        await lpAccount.connect(adminSafe).registerZap(zap.address);

        deepEqual([name], await lpAccount.zapNames());
      });
    });

    describe("removeZap", () => {
      let zap;
      let name;

      beforeEach("Register a zap", async () => {
        zap = await deployMockZap();
        name = await zap.NAME();
        await lpAccount.connect(adminSafe).registerZap(zap.address);
      });

      it("Admin Safe can call", async () => {
        await expect(lpAccount.connect(adminSafe).removeZap(name)).to.not.be
          .reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          lpAccount.connect(randomUser).removeZap(name)
        ).to.be.revertedWith("NOT_ADMIN_ROLE");
      });

      it("can remove", async () => {
        expect(await lpAccount.zapNames()).to.deep.equal([name]);

        await lpAccount.connect(adminSafe).removeZap(name);
        expect(await lpAccount.zapNames()).to.deep.equal([]);
      });
    });

    describe("Deploying, unwinding, and claiming", () => {
      let tvlManager;
      let erc20Allocation;
      let oracleAdapter;

      before("Setup TvlManager", async () => {
        const [deployer] = await ethers.getSigners();
        tvlManager = await deployMockContract(deployer, TvlManager.abi);
        erc20Allocation = await deployMockContract(
          deployer,
          Erc20Allocation.abi
        );
        oracleAdapter = await deployMockContract(deployer, OracleAdapter.abi);

        await addressRegistry.mock.getAddress
          .withArgs(bytes32("tvlManager"))
          .returns(tvlManager.address);

        await tvlManager.mock.getAssetAllocation
          .withArgs("erc20Allocation")
          .returns(erc20Allocation.address);

        await addressRegistry.mock.oracleAdapterAddress.returns(
          oracleAdapter.address
        );

        await tvlManager.mock["isAssetAllocationRegistered(string[])"].returns(
          true
        );
        await erc20Allocation.mock["isErc20TokenRegistered(address[])"].returns(
          true
        );
        await oracleAdapter.mock.lockFor.returns();
      });

      describe("deployStrategy", () => {
        it("Revert on unregistered name", async () => {
          const zap = await deployMockZap();

          const name = await zap.NAME();
          const amounts = [];

          await expect(
            lpAccount.connect(lpSafe).deployStrategy(name, amounts)
          ).to.be.revertedWith("INVALID_NAME");
        });

        it("LP Safe can call", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amounts = [];

          await expect(lpAccount.connect(lpSafe).deployStrategy(name, amounts))
            .to.not.be.reverted;
        });

        it("Unpermissioned cannot call", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amounts = [];

          await expect(
            lpAccount.connect(randomUser).deployStrategy(name, amounts)
          ).to.be.revertedWith("NOT_LP_ROLE");
        });

        it("can deploy", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amounts = [
            tokenAmountToBigNumber(1),
            tokenAmountToBigNumber(2),
            tokenAmountToBigNumber(3),
          ];

          await lpAccount.connect(lpSafe).deployStrategy(name, amounts);
          deepEqual(amounts, await lpAccount._deployCalls());
        });

        it("cannot deploy with unregistered allocation", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amounts = [
            tokenAmountToBigNumber(1),
            tokenAmountToBigNumber(2),
            tokenAmountToBigNumber(3),
          ];

          await tvlManager.mock[
            "isAssetAllocationRegistered(string[])"
          ].returns(false);

          await expect(
            lpAccount.connect(lpSafe).deployStrategy(name, amounts)
          ).to.be.revertedWith("MISSING_ASSET_ALLOCATIONS");
        });

        it("cannot deploy with unregistered ERC20", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amounts = [
            tokenAmountToBigNumber(1),
            tokenAmountToBigNumber(2),
            tokenAmountToBigNumber(3),
          ];

          await erc20Allocation.mock[
            "isErc20TokenRegistered(address[])"
          ].returns(false);

          await expect(
            lpAccount.connect(lpSafe).deployStrategy(name, amounts)
          ).to.be.revertedWith("MISSING_ERC20_ALLOCATIONS");
        });
      });

      describe("unwindStrategy", () => {
        it("Revert on unregistered name", async () => {
          const zap = await deployMockZap();

          const name = await zap.NAME();
          const amount = tokenAmountToBigNumber(100);
          const index = 2;

          await expect(
            lpAccount.connect(lpSafe).unwindStrategy(name, amount, index)
          ).to.be.revertedWith("INVALID_NAME");
        });

        it("LP Safe can call", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amount = tokenAmountToBigNumber(100);
          const index = 2;

          await expect(
            lpAccount.connect(lpSafe).unwindStrategy(name, amount, index)
          ).to.not.be.reverted;
        });

        it("Unpermissioned cannot call", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amount = tokenAmountToBigNumber(100);
          const index = 2;

          await expect(
            lpAccount.connect(randomUser).unwindStrategy(name, amount, index)
          ).to.be.revertedWith("NOT_LP_ROLE");
        });

        it("can unwind", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amount = tokenAmountToBigNumber(100);
          const index = 2;

          await lpAccount.connect(lpSafe).unwindStrategy(name, amount, index);
          deepEqual([amount], await lpAccount._unwindCalls());
        });
      });

      describe("Claiming", () => {
        it("Revert on unregistered name", async () => {
          const zap = await deployMockZap();
          const name = await zap.NAME();

          await expect(
            lpAccount.connect(lpSafe).claim(name)
          ).to.be.revertedWith("INVALID_NAME");
        });

        it("LP Safe can call", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();

          await expect(lpAccount.connect(lpSafe).claim(name)).to.not.be
            .reverted;
        });

        it("Unpermissioned cannot call", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();

          await expect(
            lpAccount.connect(randomUser).claim(name)
          ).to.be.revertedWith("NOT_LP_ROLE");
        });

        it("can claim", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();

          await lpAccount.connect(lpSafe).claim(name);
          expect(await lpAccount._claimsCounter()).to.equal(1);
        });

        it("cannot deploy with unregistered ERC20", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();

          await erc20Allocation.mock[
            "isErc20TokenRegistered(address[])"
          ].returns(false);

          await expect(
            lpAccount.connect(lpSafe).claim(name)
          ).to.be.revertedWith("MISSING_ERC20_ALLOCATIONS");
        });
      });

      describe("Fee deduction from claiming", () => {
        it("Only Admin Safe can register reward token with fee", async () => {
          await expect(
            lpAccount.connect(adminSafe).registerRewardFee(ZERO_ADDRESS, 1500)
          ).to.not.be.reverted;

          await expect(
            lpAccount.connect(randomUser).registerRewardFee(ZERO_ADDRESS, 1500)
          ).to.be.reverted;
        });

        it("Only Admin Safe can register reward token without fee (default fee)", async () => {
          await expect(
            lpAccount.connect(adminSafe).registerDefaultRewardFee(ZERO_ADDRESS)
          ).to.not.be.reverted;

          await expect(
            lpAccount.connect(randomUser).registerDefaultRewardFee(ZERO_ADDRESS)
          ).to.be.reverted;
        });

        it("deducts fee from registered reward token", async () => {
          const TestRewardZap = await ethers.getContractFactory(
            "TestRewardZap"
          );
          const name = "mockZap";
          const zap = await TestRewardZap.deploy(name);
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const TestErc20 = await ethers.getContractFactory("TestErc20");
          const testToken_1 = await TestErc20.deploy(
            "Test ERC20 Token 1",
            "TET1"
          );
          const testToken_2 = await TestErc20.deploy(
            "Test ERC20 Token 2",
            "TET2"
          );
          await testToken_1.approve(lpAccount.address, MAX_UINT256);
          await testToken_2.approve(lpAccount.address, MAX_UINT256);

          await lpAccount.setTestMinter(deployer.address);
          await lpAccount.setTestRewardTokens([
            testToken_1.address,
            testToken_2.address,
          ]);

          const fee = 1500; // in bps
          await lpAccount
            .connect(adminSafe)
            .registerRewardFee(testToken_1.address, fee);

          expect(await testToken_1.balanceOf(lpAccount.address)).to.equal(0);
          expect(await testToken_2.balanceOf(treasurySafe.address)).to.equal(0);

          await lpAccount.connect(lpSafe).claim(name);

          // LP Account should hold balances for both reward tokens
          expect(await testToken_1.balanceOf(lpAccount.address)).to.be.gt(0);
          expect(await testToken_2.balanceOf(lpAccount.address)).to.be.gt(0);

          // first token is registered, so expect Treasury Safe to hold a balance
          expect(await testToken_1.balanceOf(treasurySafe.address)).to.be.gt(0);

          // second token is not registered, so don't expect Treasury Safe to hold balance
          expect(await testToken_2.balanceOf(treasurySafe.address)).to.equal(0);

          // check appropriate fee taken out
          const treasuryBalance = await testToken_1.balanceOf(
            treasurySafe.address
          );
          const claimAmount = await zap.CLAIM_AMOUNT();
          const collectedFee = claimAmount.mul(fee).div(10000);
          expect(treasuryBalance).to.equal(collectedFee);
        });
      });
    });
  });

  describe("Swaps", () => {
    describe("registerSwap", () => {
      it("Admin Safe can call", async () => {
        const swap = await deployMockSwap();
        await expect(lpAccount.connect(adminSafe).registerSwap(swap.address)).to
          .not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        const swap = await deployMockSwap();
        await expect(
          lpAccount.connect(randomUser).registerSwap(swap.address)
        ).to.be.revertedWith("NOT_ADMIN_ROLE");
      });

      it("can register", async () => {
        expect(await lpAccount.swapNames()).to.be.empty;

        const swap = await deployMockSwap();
        const name = await swap.NAME();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);

        deepEqual([name], await lpAccount.swapNames());
      });
    });

    describe("removeSwap", () => {
      let swap;
      let name;

      beforeEach("Register a swap", async () => {
        swap = await deployMockSwap();
        name = await swap.NAME();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);
      });

      it("Admin Safe can call", async () => {
        await expect(lpAccount.connect(adminSafe).removeSwap(name)).to.not.be
          .reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          lpAccount.connect(randomUser).removeSwap(name)
        ).to.be.revertedWith("NOT_ADMIN_ROLE");
      });

      it("can remove", async () => {
        expect(await lpAccount.swapNames()).to.deep.equal([name]);

        await lpAccount.connect(adminSafe).removeSwap(name);
        expect(await lpAccount.swapNames()).to.deep.equal([]);
      });
    });

    describe("swap", () => {
      let tvlManager;
      let erc20Allocation;

      before("Setup TvlManager", async () => {
        const [deployer] = await ethers.getSigners();
        tvlManager = await deployMockContract(deployer, TvlManager.abi);
        erc20Allocation = await deployMockContract(
          deployer,
          Erc20Allocation.abi
        );

        await addressRegistry.mock.getAddress
          .withArgs(bytes32("tvlManager"))
          .returns(tvlManager.address);

        await tvlManager.mock.getAssetAllocation
          .withArgs("erc20Allocation")
          .returns(erc20Allocation.address);

        await erc20Allocation.mock["isErc20TokenRegistered(address[])"].returns(
          true
        );
      });

      it("Revert on unregistered name", async () => {
        const swap = await deployMockSwap();

        const name = await swap.NAME();
        const amount = tokenAmountToBigNumber(100);

        await expect(
          lpAccount.connect(lpSafe).swap(name, amount, 0)
        ).to.be.revertedWith("INVALID_NAME");
      });

      it("LP Safe can call", async () => {
        const swap = await deployMockSwap();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);

        const name = await swap.NAME();
        const amount = tokenAmountToBigNumber(100);

        await expect(lpAccount.connect(lpSafe).swap(name, amount, 0)).to.not.be
          .reverted;
      });

      it("Unpermissioned cannot call", async () => {
        const swap = await deployMockSwap();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);

        const name = await swap.NAME();
        const amount = tokenAmountToBigNumber(100);

        await expect(
          lpAccount.connect(randomUser).swap(name, amount, 0)
        ).to.be.revertedWith("NOT_LP_ROLE");
      });

      it("can swap", async () => {
        const swap = await deployMockSwap();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);

        const name = await swap.NAME();
        const amount = tokenAmountToBigNumber(100);

        await lpAccount.connect(lpSafe).swap(name, amount, 0);
        deepEqual([amount], await lpAccount._swapCalls());
      });

      it("cannot deploy with unregistered ERC20", async () => {
        const swap = await deployMockSwap();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);

        const name = await swap.NAME();
        const amount = tokenAmountToBigNumber(1);

        await erc20Allocation.mock["isErc20TokenRegistered(address[])"].returns(
          false
        );

        await expect(
          lpAccount.connect(lpSafe).swap(name, amount, 0)
        ).to.be.revertedWith("MISSING_ERC20_ALLOCATIONS");
      });
    });
  });

  describe("transferToPool", () => {
    let pool;
    let underlyer;

    before("Setup mock pool with underlyer", async () => {
      pool = await deployMockContract(
        deployer,
        artifacts.readArtifactSync("ILiquidityPoolV2").abi
      );
      underlyer = await deployMockContract(
        deployer,
        artifacts.readArtifactSync("IDetailedERC20").abi
      );

      await pool.mock.underlyer.returns(underlyer.address);
      await underlyer.mock.transfer.returns(true);
    });

    it("mApt can call", async () => {
      await expect(lpAccount.connect(mApt).transferToPool(pool.address, 0)).to
        .not.be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      await expect(
        lpAccount.connect(randomUser).transferToPool(pool.address, 0)
      ).to.be.revertedWith("NOT_CONTRACT_ROLE");
    });

    it("Calls transfer on underlyer with the right args", async () => {
      const amount = tokenAmountToBigNumber("100");

      // check underlyer's transfer function is called
      await underlyer.mock.transfer.revertsWithReason("CALLED_TRANSFER");
      await expect(
        lpAccount.connect(mApt).transferToPool(pool.address, amount)
      ).to.be.revertedWith("CALLED_TRANSFER");

      // check transfer is called with the right args
      await underlyer.mock.transfer
        .withArgs(pool.address, amount)
        .returns(true);

      await expect(lpAccount.connect(mApt).transferToPool(pool.address, amount))
        .to.not.be.reverted;
    });
  });
});
