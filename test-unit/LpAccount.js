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

describe("Contract: LpAccount", () => {
  // signers
  let deployer;
  let lpSafe;
  let emergencySafe;
  let adminSafe;
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
      lpSafe,
      emergencySafe,
      adminSafe,
      randomUser,
    ] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      IAddressRegistryV2.abi
    );

    // These registered addresses are setup for roles in the
    // constructor for LpAccount
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("adminSafe"))
      .returns(adminSafe.address);

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

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await lpAccount.LP_ROLE();
      const memberCount = await lpAccount.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await lpAccount.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });

    it("Admin role given to Admin Safe", async () => {
      const ADMIN_ROLE = await lpAccount.ADMIN_ROLE();
      const memberCount = await lpAccount.getRoleMemberCount(ADMIN_ROLE);
      expect(memberCount).to.equal(1);
      expect(await lpAccount.hasRole(ADMIN_ROLE, adminSafe.address)).to.be.true;
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

  describe("registerZap", () => {
    it("Admin Safe can call", async () => {
      const zap = await deployMockZap();
      await expect(lpAccount.connect(adminSafe).registerZap(zap.address)).to.not
        .be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      const zap = await deployMockZap();
      await expect(
        lpAccount.connect(randomUser).registerZap(zap.address)
      ).to.be.revertedWith("NOT_ADMIN_ROLE");
    });

    it("can register", async () => {
      expect(await lpAccount.names()).to.be.empty;

      const zap = await deployMockZap();
      const name = await zap.NAME();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      expect(await lpAccount.names()).to.deep.equal([name]);
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
      await expect(lpAccount.connect(adminSafe).removeZap(name)).to.not.be
        .reverted;
    });

    it("can remove", async () => {
      expect(await lpAccount.names()).to.deep.equal([name]);

      await lpAccount.connect(adminSafe).removeZap(name);
      expect(await lpAccount.names()).to.deep.equal([]);
    });
  });

  describe("Deploying and unwinding", () => {
    let tvlManager;
    let erc20Allocation;

    before("Setup TvlManager", async () => {
      const [deployer] = await ethers.getSigners();
      tvlManager = await deployMockContract(deployer, TvlManager.abi);
      erc20Allocation = await deployMockContract(deployer, Erc20Allocation.abi);

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

        await expect(lpAccount.connect(lpSafe).deployStrategy(name, amounts)).to
          .not.be.reverted;
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

        await tvlManager.mock["isAssetAllocationRegistered(address[])"].returns(
          false
        );

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

        await erc20Allocation.mock["isErc20TokenRegistered(address[])"].returns(
          false
        );

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

        await expect(lpAccount.connect(lpSafe).unwindStrategy(name, amount)).to
          .not.be.reverted;
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
