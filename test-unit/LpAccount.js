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

const IAssetAllocation = artifacts.readArtifactSync("IAssetAllocation");
const IZap = artifacts.readArtifactSync("IZap");
const IAddressRegistryV2 = artifacts.readArtifactSync("IAddressRegistryV2");

async function generateContractAddress() {
  const [deployer] = await ethers.getSigners();
  const contract = await deployMockContract(deployer, []);
  return contract.address;
}

async function deployMockAllocation(name) {
  const [deployer] = await ethers.getSigners();
  const allocation = await deployMockContract(deployer, IAssetAllocation.abi);
  await allocation.mock.NAME.returns(name || "mockAllocation");
  return allocation;
}

async function deployMockZap(name) {
  const [deployer] = await ethers.getSigners();
  const zap = await deployMockContract(deployer, IZap.abi);
  await zap.mock.NAME.returns(name || "mockZap");
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
  let erc20Allocation;

  const mockSymbol = "MOCK";

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

    const LpAccount = await ethers.getContractFactory("LpAccount");
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
    it("can register", async () => {
      expect(await lpAccount.names()).to.be.empty;

      const zap = await deployMockZap();
      const name = await zap.NAME();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      expect(await lpAccount.names()).to.deep.equal([name]);
    });
  });

  describe("removeZap", () => {
    it("can remove", async () => {
      const zap = await deployMockZap();
      const name = await zap.NAME();
      await lpAccount.connect(adminSafe).registerZap(zap.address);
      expect(await lpAccount.names()).to.deep.equal([name]);

      await lpAccount.connect(adminSafe).removeZap(name);
      expect(await lpAccount.names()).to.deep.equal([]);
    });
  });
});
