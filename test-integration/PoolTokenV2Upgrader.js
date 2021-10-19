const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const {
  bytes32,
  impersonateAccount,
  forciblySendEth,
  tokenAmountToBigNumber,
  getDeployedAddress,
  FAKE_ADDRESS,
  ZERO_ADDRESS,
  getLogicContract,
} = require("../utils/helpers");
const {
  AGG_MAP: { MAINNET: AGGS },
} = require("../utils/constants");
const timeMachine = require("ganache-time-traveler");

const MAINNET_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";

describe.only("Contract: PoolTokenV2Upgrader", () => {
  // signers
  let deployer;
  let adminSafe;

  // contract factories
  let PoolTokenV2Upgrader;

  // deployed factories
  let poolTokenV2Factory;

  let poolProxyAdminAddress;

  let upgrader;
  let addressRegistry;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Attach to Mainnet Address Registry", async () => {
    [deployer] = await ethers.getSigners();

    addressRegistry = await ethers.getContractAt(
      "AddressRegistryV2",
      MAINNET_ADDRESS_REGISTRY
    );
  });

  before("Transfer necessary ownerships to Admin Safe", async () => {
    const adminSafeAddress = getDeployedAddress("AdminSafe", "MAINNET");
    adminSafe = await ethers.getContractAt(
      "IGnosisModuleManager",
      adminSafeAddress
    );
    const addressRegistryProxyAdminAddress = getDeployedAddress(
      "AddressRegistryProxyAdmin",
      "MAINNET"
    );
    const addressRegistryProxyAdmin = await ethers.getContractAt(
      "ProxyAdmin",
      addressRegistryProxyAdminAddress
    );
    const addressRegistryDeployerAddress = await addressRegistryProxyAdmin.owner();
    const addressRegistryDeployer = await impersonateAccount(
      addressRegistryDeployerAddress
    );
    await forciblySendEth(
      addressRegistryDeployer.address,
      tokenAmountToBigNumber(10),
      deployer.address
    );
    await addressRegistryProxyAdmin
      .connect(addressRegistryDeployer)
      .transferOwnership(adminSafe.address);

    poolProxyAdminAddress = getDeployedAddress(
      "PoolTokenProxyAdmin",
      "MAINNET"
    );
    const poolProxyAdmin = await ethers.getContractAt(
      "ProxyAdmin",
      poolProxyAdminAddress
    );
    const poolDeployerAddress = await poolProxyAdmin.owner();
    const poolDeployer = await impersonateAccount(poolDeployerAddress);
    await forciblySendEth(
      poolDeployer.address,
      tokenAmountToBigNumber(10),
      deployer.address
    );
    await poolProxyAdmin
      .connect(poolDeployer)
      .transferOwnership(adminSafe.address);
  });

  before("Deploy factories and mock deployed addresses", async () => {
    const PoolTokenV2Factory = await ethers.getContractFactory(
      "PoolTokenV2Factory"
    );
    poolTokenV2Factory = await PoolTokenV2Factory.deploy();

    PoolTokenV2Upgrader = await ethers.getContractFactory(
      "PoolTokenV2Upgrader"
    );
  });

  before("Deploy upgrader", async () => {
    upgrader = await expect(
      PoolTokenV2Upgrader.deploy(
        poolTokenV2Factory.address // pool token v2 factory
      )
    ).to.not.be.reverted;
  });

  describe("Defaults", () => {
    it("Address Registry is set", async () => {
      expect(await upgrader.addressRegistry()).to.equal(
        MAINNET_ADDRESS_REGISTRY
      );
    });
  });
});
