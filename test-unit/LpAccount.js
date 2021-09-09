const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  ZERO_ADDRESS,
  FAKE_ADDRESS,
  bytes32,
  tokenAmountToBigNumber,
} = require("../utils/helpers");

const IAddressRegistryV2 = artifacts.readArtifactSync("IAddressRegistryV2");
const TvlManager = artifacts.readArtifactSync("TvlManager");
const Erc20Allocation = artifacts.readArtifactSync("Erc20Allocation");

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

describe("Contract: LpAccount", () => {
  // signers
  let deployer;
  let lpSafe;
  let emergencySafe;
  let adminSafe;
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

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    proxyAdmin = await ProxyAdmin.deploy();

    const LpAccount = await ethers.getContractFactory("TestLpAccount");
    const logic = await LpAccount.deploy();

    const initData = LpAccount.interface.encodeFunctionData(
      "initialize(address,address)",
      [proxyAdmin.address, addressRegistry.address]
    );

    const TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    const proxy = await TransparentUpgradeableProxy.deploy(
      logic.address,
      proxyAdmin.address,
      initData
    );

    lpAccount = await LpAccount.attach(proxy.address);
  });

  describe("Initializer", () => {
    it.skip("Reverts on non-contract address for logic contract", async () => {});
    it.skip("Reverts on zero address for proxy admin", async () => {});
    it.skip("Reverts on non-contract address for address registry", async () => {});
  });

  describe("Defaults", () => {
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

  describe("emergencySetAdminAddress", () => {
    it("Emergency Safe can call", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await expect(
        lpAccount
          .connect(emergencySafe)
          .emergencySetAdminAddress(someContractAddress)
      ).to.not.be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await expect(
        lpAccount
          .connect(randomUser)
          .emergencySetAdminAddress(someContractAddress)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Address can be set", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await lpAccount
        .connect(emergencySafe)
        .emergencySetAdminAddress(someContractAddress);
      expect(await lpAccount.proxyAdmin()).to.equal(someContractAddress);
    });

    it("Cannot set to non-contract address", async () => {
      await expect(
        lpAccount.connect(emergencySafe).emergencySetAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
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

        expect(await lpAccount.zapNames()).to.deep.equal([name]);
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

    describe("Deploying and unwinding", () => {
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

        await tvlManager.mock["isAssetAllocationRegistered(address[])"].returns(
          true
        );
        await erc20Allocation.mock["isErc20TokenRegistered(address[])"].returns(
          true
        );
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
          expect(await lpAccount._deployCalls()).to.deep.equal([amounts]);
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
            "isAssetAllocationRegistered(address[])"
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

          await expect(
            lpAccount.connect(lpSafe).unwindStrategy(name, amount)
          ).to.be.revertedWith("INVALID_NAME");
        });

        it("LP Safe can call", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amount = tokenAmountToBigNumber(100);

          await expect(lpAccount.connect(lpSafe).unwindStrategy(name, amount))
            .to.not.be.reverted;
        });

        it("Unpermissioned cannot call", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amount = tokenAmountToBigNumber(100);

          await expect(
            lpAccount.connect(randomUser).unwindStrategy(name, amount)
          ).to.be.revertedWith("NOT_LP_ROLE");
        });

        it("can unwind", async () => {
          const zap = await deployMockZap();
          await lpAccount.connect(adminSafe).registerZap(zap.address);

          const name = await zap.NAME();
          const amount = tokenAmountToBigNumber(100);

          await lpAccount.connect(lpSafe).unwindStrategy(name, amount);
          expect(await lpAccount._unwindCalls()).to.deep.equal([amount]);
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

        expect(await lpAccount.swapNames()).to.deep.equal([name]);
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

        await tvlManager.mock["isAssetAllocationRegistered(address[])"].returns(
          true
        );
        await erc20Allocation.mock["isErc20TokenRegistered(address[])"].returns(
          true
        );
      });

      it("Revert on unregistered name", async () => {
        const swap = await deployMockSwap();

        const name = await swap.NAME();
        const amount = tokenAmountToBigNumber(100);

        await expect(
          lpAccount.connect(lpSafe).swap(name, amount)
        ).to.be.revertedWith("INVALID_NAME");
      });

      it("LP Safe can call", async () => {
        const swap = await deployMockSwap();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);

        const name = await swap.NAME();
        const amount = tokenAmountToBigNumber(100);

        await expect(lpAccount.connect(lpSafe).swap(name, amount)).to.not.be
          .reverted;
      });

      it("Unpermissioned cannot call", async () => {
        const swap = await deployMockSwap();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);

        const name = await swap.NAME();
        const amount = tokenAmountToBigNumber(100);

        await expect(
          lpAccount.connect(randomUser).swap(name, amount)
        ).to.be.revertedWith("NOT_LP_ROLE");
      });

      it("can swap", async () => {
        const swap = await deployMockSwap();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);

        const name = await swap.NAME();
        const amount = tokenAmountToBigNumber(100);

        await lpAccount.connect(lpSafe).swap(name, amount);
        expect(await lpAccount._swapCalls()).to.deep.equal([amount]);
      });

      it("cannot deploy with unregistered allocation", async () => {
        const swap = await deployMockSwap();
        await lpAccount.connect(adminSafe).registerSwap(swap.address);

        const name = await swap.NAME();
        const amount = tokenAmountToBigNumber(1);

        await tvlManager.mock["isAssetAllocationRegistered(address[])"].returns(
          false
        );

        await expect(
          lpAccount.connect(lpSafe).swap(name, amount)
        ).to.be.revertedWith("MISSING_ASSET_ALLOCATIONS");
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
          lpAccount.connect(lpSafe).swap(name, amount)
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

  describe("Claiming", () => {
    it.only("can claim", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();

      await lpAccount.connect(lpSafe).claim(name);
    });
  });
});
