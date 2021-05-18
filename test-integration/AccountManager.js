const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");
const { solidityKeccak256: hash, solidityPack: pack } = ethers.utils;
const timeMachine = require("ganache-time-traveler");
const {
  impersonateAccount,
  bytes32,
  acquireToken,
  FAKE_ADDRESS,
  getStablecoinAddress,
} = require("../utils/helpers");
const { deployMockContract } = require("ethereum-waffle");
const { STABLECOIN_POOLS } = require("../utils/constants");

const erc20Interface = new ethers.utils.Interface(
  artifacts.require("ERC20").abi
);

// Mainnet addresses
const DAI_TOKEN = getStablecoinAddress("DAI", "MAINNET");
const USDC_TOKEN = getStablecoinAddress("USDC", "MAINNET");
const USDT_TOKEN = getStablecoinAddress("USDT", "MAINNET");
const POOL_DEPLOYER = "0x6EAF0ab3455787bA10089800dB91F11fDf6370BE";
const ADDRESS_REGISTRY_DEPLOYER = "0x720edBE8Bb4C3EA38F370bFEB429D715b48801e3";
const APY_POOL_ADMIN = "0x7965283631253DfCb71Db63a60C656DEDF76234f";
const APY_REGISTRY_ADMIN = "0xFbF6c940c1811C3ebc135A9c4e39E042d02435d1";
const APY_ADDRESS_REGISTRY = "0x7EC81B7035e91f8435BdEb2787DCBd51116Ad303";
const APY_DAI_POOL = "0x75CE0E501E2E6776FCAAA514F394A88A772A8970";
const APY_USDC_POOL = "0xe18b0365D5D09F394f84eE56ed29DD2d8D6Fba5f";
const APY_USDT_POOL = "0xeA9c5a2717D5Ab75afaAC340151e73a7e37d99A7";

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
  let accountManager;
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

    const ProxyAdminFactory = await ethers.getContractFactory("ProxyAdmin");

    /***********************************/
    /* upgrade pools to V2 */
    /***********************************/
    const PoolTokenV2 = await ethers.getContractFactory("PoolTokenV2");
    const newPoolLogic = await PoolTokenV2.deploy();
    const poolAdmin = await ethers.getContractAt(
      "ProxyAdmin",
      APY_POOL_ADMIN,
      poolDeployer
    );

    await poolAdmin.upgrade(APY_DAI_POOL, newPoolLogic.address);
    await poolAdmin.upgrade(APY_USDC_POOL, newPoolLogic.address);
    await poolAdmin.upgrade(APY_USDT_POOL, newPoolLogic.address);

    /*************************************/
    /***** Upgrade Address Registry ******/
    /*************************************/
    const IAddressRegistry = await ethers.getContractFactory(
      "IAddressRegistry"
    );
    const newAddressRegistryLogic = await IAddressRegistry.deploy();
    const registryAdmin = await ethers.getContractAt(
      "ProxyAdmin",
      APY_REGISTRY_ADMIN,
      addressRegistryDeployer
    );

    await registryAdmin.upgrade(
      APY_ADDRESS_REGISTRY,
      newAddressRegistryLogic.address
    );

    const addressRegistry = await ethers.getContractAt(
      "IAddressRegistry",
      APY_ADDRESS_REGISTRY,
      addressRegistryDeployer
    );

    /*************************************/
    /***** Deploy mAPT ******/
    /*************************************/

    const tvlAgg = await deployMockContract(deployer, []);

    const MetaPoolTokenProxy = await ethers.getContractFactory(
      "MetaPoolTokenProxy"
    );
    // Use the *test* contract so we can set the TVL
    const MetaPoolToken = await ethers.getContractFactory("TestMetaPoolToken");
    const proxyAdmin = await ProxyAdminFactory.deploy();
    await proxyAdmin.deployed();

    const logic = await MetaPoolToken.deploy();
    await logic.deployed();

    const aggStalePeriod = 14400;
    const mAPTProxy = await MetaPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      tvlAgg.address,
      aggStalePeriod
    );
    await mAPTProxy.deployed();

    const mAPT = await MetaPoolToken.attach(mAPTProxy.address);
    await addressRegistry.registerAddress(
      ethers.utils.formatBytes32String("mAPT"),
      mAPT.address
    );

    /***********************************/
    /***** deploy manager  *************/
    /***********************************/
    const AccountManager = await ethers.getContractFactory("AccountManager");
    const AccountManagerProxy = await ethers.getContractFactory(
      "AccountManagerProxy"
    );

    const managerAdmin = await ProxyAdminFactory.connect(deployer).deploy();
    await managerAdmin.deployed();
    const accountManagerLogic = await AccountManager.deploy();
    await accountManagerLogic.deployed();
    const accountManagerProxy = await AccountManagerProxy.deploy(
      accountManagerLogic.address,
      managerAdmin.address,
      APY_ADDRESS_REGISTRY
    );
    await accountManagerProxy.deployed();
    accountManager = await AccountManager.attach(accountManagerProxy.address);

    await addressRegistry.registerAddress(
      ethers.utils.formatBytes32String("accountManager"),
      accountManager.address
    );

    // approve manager to withdraw from pools
    daiPool = await ethers.getContractAt(
      "PoolTokenV2",
      APY_DAI_POOL,
      poolDeployer
    );
    usdcPool = await ethers.getContractAt(
      "PoolTokenV2",
      APY_USDC_POOL,
      poolDeployer
    );
    usdtPool = await ethers.getContractAt(
      "PoolTokenV2",
      APY_USDT_POOL,
      poolDeployer
    );
    await daiPool.infiniteApprove(accountManager.address);
    await usdcPool.infiniteApprove(accountManager.address);
    await usdtPool.infiniteApprove(accountManager.address);

    /*************************************/
    /***** Register Pool Manager ******/
    /*************************************/

    await addressRegistry.registerAddress(
      ethers.utils.formatBytes32String("poolManager"),
      FAKE_ADDRESS
    );

    /*************************************/
    /***** deploy TVL Manager ************/
    /*************************************/
    const TVLManager = await ethers.getContractFactory("TVLManager");
    tvlManager = await TVLManager.deploy(addressRegistry.address);
    await tvlManager.deployed();

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

    await accountManager.deployAccount(accountId, executor.address);
    accountAddress = await accountManager.getAccount(accountId);

    daiToken = await ethers.getContractAt("IDetailedERC20", DAI_TOKEN);
    usdcToken = await ethers.getContractAt("IDetailedERC20", USDC_TOKEN);
    usdtToken = await ethers.getContractAt("IDetailedERC20", USDT_TOKEN);
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
        accountManager.connect(randomUser).execute(accountId, [], [])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can call", async () => {
      const encodedFunction = erc20Interface.encodeFunctionData("symbol()", []);
      await expect(
        accountManager.execute(
          accountId,
          [[daiToken.address, encodedFunction]],
          []
        )
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
        [accountManager.address, amount]
      );

      await accountManager.execute(
        accountId,
        [[daiToken.address, encodedApprove]],
        [["DAI", 18, [daiToken.address, encodedBalanceOf]]]
      );

      const daiAllowance = await daiToken.allowance(
        accountAddress,
        accountManager.address
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
