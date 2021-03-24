const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");
const { solidityKeccak256: hash, solidityPack: pack } = ethers.utils;
const timeMachine = require("ganache-time-traveler");
const legos = require("@apy-finance/defi-legos");
const {
  impersonateAccount,
  bytes32,
  acquireToken,
  FAKE_ADDRESS,
} = require("../utils/helpers");
const { deployMockContract } = require("ethereum-waffle");
const { STABLECOIN_POOLS } = require("../utils/constants");

const erc20Interface = new ethers.utils.Interface(
  artifacts.require("ERC20").abi
);

const POOL_DEPLOYER = "0x6EAF0ab3455787bA10089800dB91F11fDf6370BE";
const ADDRESS_REGISTRY_DEPLOYER = "0x720edBE8Bb4C3EA38F370bFEB429D715b48801e3";

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Contract: AccountManager - deployAccount", () => {
  let manager;
  let executor;

  // signers
  let deployer;
  let randomUser;

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
    [deployer, randomUser] = await ethers.getSigners();

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const AccountManager = await ethers.getContractFactory("AccountManager");
    const AccountManagerProxy = await ethers.getContractFactory(
      "AccountManagerProxy"
    );

    const dummyContract = await deployMockContract(deployer, []);
    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    const logic = await AccountManager.deploy();
    await logic.deployed();
    const proxy = await AccountManagerProxy.deploy(
      logic.address,
      proxyAdmin.address,
      dummyContract.address
    );
    await proxy.deployed();
    manager = AccountManager.attach(proxy.address);

    const GenericExecutor = await ethers.getContractFactory("GenericExecutor");
    executor = await GenericExecutor.deploy();
    await executor.deployed();
  });

  it("non-owner cannot call", async () => {
    expect(await manager.owner()).to.not.equal(randomUser.address);

    await expect(
      manager
        .connect(randomUser)
        .deployAccount(bytes32("account1"), executor.address)
    ).to.be.revertedWith("revert Ownable: caller is not the owner");
  });

  it("Owner can call", async () => {
    const accountId = bytes32("account1");
    await expect(
      manager.connect(deployer).deployAccount(accountId, executor.address)
    ).to.not.be.reverted;

    const accountAddress = await manager.getAccount(accountId);
    const account = await ethers.getContractAt("Account", accountAddress);
    expect(await account.owner()).to.equal(manager.address);
  });
});

describe("Contract: AccountManager", () => {
  // to-be-deployed contracts
  let manager;
  let tvlManager;
  let executor;

  // signers
  let deployer;
  let randomUser;

  // existing Mainnet contracts
  let daiPool;
  let usdcPool;
  let usdtPool;

  let daiToken;
  let usdcToken;
  let usdtToken;

  // Account instance params
  const accountId = bytes32("account1");
  let accountAddress;

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
    [deployer, randomUser] = await ethers.getSigners();

    /*************************************/
    /* unlock and fund Mainnet deployers */
    /*************************************/
    await deployer.sendTransaction({
      to: POOL_DEPLOYER,
      value: ethers.utils.parseEther("10").toHexString(),
    });
    const poolDeployer = await impersonateAccount(POOL_DEPLOYER);

    await deployer.sendTransaction({
      to: ADDRESS_REGISTRY_DEPLOYER,
      value: ethers.utils.parseEther("10").toHexString(),
    });
    const addressRegistryDeployer = await impersonateAccount(
      ADDRESS_REGISTRY_DEPLOYER
    );

    /***********************************/
    /* upgrade pools to V2 */
    /***********************************/
    const PoolTokenV2 = await ethers.getContractFactory("PoolTokenV2");
    const newPoolLogic = await PoolTokenV2.deploy();
    const poolAdmin = await ethers.getContractAt(
      legos.apy.abis.APY_POOL_Admin,
      legos.apy.addresses.APY_POOL_Admin,
      poolDeployer
    );

    await poolAdmin.upgrade(
      legos.apy.addresses.APY_DAI_POOL,
      newPoolLogic.address
    );
    await poolAdmin.upgrade(
      legos.apy.addresses.APY_USDC_POOL,
      newPoolLogic.address
    );
    await poolAdmin.upgrade(
      legos.apy.addresses.APY_USDT_POOL,
      newPoolLogic.address
    );

    /***********************************/
    /***** deploy manager  *************/
    /***********************************/
    const AccountManager = await ethers.getContractFactory("AccountManager");
    const AccountManagerProxy = await ethers.getContractFactory(
      "AccountManagerProxy"
    );

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const managerAdmin = await ProxyAdmin.connect(deployer).deploy();
    await managerAdmin.deployed();
    const managerLogic = await AccountManager.deploy();
    await managerLogic.deployed();
    const managerProxy = await AccountManagerProxy.deploy(
      managerLogic.address,
      managerAdmin.address,
      legos.apy.addresses.APY_ADDRESS_REGISTRY
    );
    await managerProxy.deployed();
    manager = await AccountManager.attach(managerProxy.address);

    // approve manager to withdraw from pools
    daiPool = await ethers.getContractAt(
      "PoolTokenV2",
      legos.apy.addresses.APY_DAI_POOL,
      poolDeployer
    );
    usdcPool = await ethers.getContractAt(
      "PoolTokenV2",
      legos.apy.addresses.APY_USDC_POOL,
      poolDeployer
    );
    usdtPool = await ethers.getContractAt(
      "PoolTokenV2",
      legos.apy.addresses.APY_USDT_POOL,
      poolDeployer
    );
    await daiPool.infiniteApprove(manager.address);
    await usdcPool.infiniteApprove(manager.address);
    await usdtPool.infiniteApprove(manager.address);

    /*************************************/
    /***** deploy TVL Manager ************/
    /*************************************/
    const TVLManager = await ethers.getContractFactory("TVLManager");
    tvlManager = await TVLManager.deploy(FAKE_ADDRESS, manager.address);
    await tvlManager.deployed();
    const addressRegistry = await ethers.getContractAt(
      legos.apy.abis.APY_ADDRESS_REGISTRY_Logic,
      legos.apy.addresses.APY_ADDRESS_REGISTRY,
      addressRegistryDeployer
    );
    await addressRegistry.registerAddress(
      bytes32("tvlManager"),
      tvlManager.address
    );

    /*********************************************/
    /* main deployments and upgrades finished 
    /*********************************************/

    const GenericExecutor = await ethers.getContractFactory("GenericExecutor");
    executor = await GenericExecutor.deploy();
    await executor.deployed();

    await manager.deployAccount(accountId, executor.address);
    accountAddress = await manager.getAccount(accountId);

    daiToken = await ethers.getContractAt(
      legos.maker.abis.DAI,
      legos.maker.addresses.DAI
    );
    usdcToken = await ethers.getContractAt(
      legos.centre.abis.USDC_Logic,
      legos.centre.addresses.USDC
    );
    usdtToken = await ethers.getContractAt(
      legos.tether.abis.USDT,
      legos.tether.addresses.USDT
    );
    await acquireToken(
      STABLECOIN_POOLS["DAI"],
      deployer,
      daiToken,
      "1000",
      deployer
    );
    await acquireToken(
      STABLECOIN_POOLS["USDC"],
      deployer,
      usdcToken,
      "1000",
      deployer
    );
    await acquireToken(
      STABLECOIN_POOLS["USDT"],
      deployer,
      usdtToken,
      "1000",
      deployer
    );
  });

  describe("Execute", () => {
    it("Non-owner cannot call", async () => {
      await expect(
        manager.connect(randomUser).execute(accountId, [], [])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can call", async () => {
      const encodedFunction = erc20Interface.encodeFunctionData("symbol()", []);
      await expect(
        manager.execute(accountId, [[daiToken.address, encodedFunction]], [])
      ).to.not.be.reverted;
    });

    it("Calldata executes properly and updates TVL Manager", async () => {
      const encodedBalanceOf = erc20Interface.encodeFunctionData(
        "balanceOf(address)",
        [accountAddress]
      );

      const amount = 100;
      const encodedApprove = erc20Interface.encodeFunctionData(
        "approve(address,uint256)",
        [manager.address, amount]
      );

      await manager.execute(
        accountId,
        [[daiToken.address, encodedApprove]],
        [["DAI", 18, [daiToken.address, encodedBalanceOf]]]
      );

      const daiAllowance = await daiToken.allowance(
        accountAddress,
        manager.address
      );
      expect(daiAllowance).to.equal(amount);

      // Check the manager registered the asset allocations corretly
      const registeredIds = await tvlManager.getAssetAllocationIds();
      expect(registeredIds.length).to.equal(1);
      const lookupId = hash(
        ["bytes"],
        [pack(["address", "bytes"], [daiToken.address, encodedBalanceOf])]
      );
      expect(registeredIds[0]).to.equal(lookupId);

      const registeredDaiSymbol = await tvlManager.symbolOf(registeredIds[0]);
      expect(registeredDaiSymbol).to.equal("DAI");

      const registeredDaiDecimals = await tvlManager.decimalsOf(
        registeredIds[0]
      );
      expect(registeredDaiDecimals).to.equal(18);

      const registeredStratDaiBal = await tvlManager.balanceOf(
        registeredIds[0]
      );
      expect(registeredStratDaiBal).equal(0);
    });
  });
});
