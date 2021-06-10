const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  impersonateAccount,
  bytes32,
  acquireToken,
  getStablecoinAddress,
  getAggregatorAddress,
} = require("../utils/helpers");
const erc20Interface = new ethers.utils.Interface(
  artifacts.require("ERC20").abi
);
const { STABLECOIN_POOLS } = require("../utils/constants");

const IDetailedERC20 = artifacts.require("IDetailedERC20");

// Mainnet addresses
const DAI_TOKEN = getStablecoinAddress("DAI", "MAINNET");
const USDC_TOKEN = getStablecoinAddress("USDC", "MAINNET");
const USDT_TOKEN = getStablecoinAddress("USDT", "MAINNET");
const POOL_DEPLOYER = "0x6EAF0ab3455787bA10089800dB91F11fDf6370BE";
const ADDRESS_REGISTRY_DEPLOYER = "0x720edBE8Bb4C3EA38F370bFEB429D715b48801e3";
const ADMIN_SAFE = "0x1f7f8DA3eac80DBc0b4A49BC447A88585D8766C8";
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

describe("Contract: PoolManager", () => {
  // to-be-deployed contracts
  let poolManager;
  let tvlManager;
  let mApt;
  let oracleAdapter;

  // signers
  let deployer;
  let lpSafe; // mock for LP Safe instance
  let randomUser;

  // existing Mainnet contracts
  let addressRegistry;

  let daiPool;
  let usdcPool;
  let usdtPool;

  let daiToken;
  let usdcToken;
  let usdtToken;

  // address for mock LP Safe instance
  let lpSafeAddress;

  // use EVM snapshots for test isolation
  let snapshotId;

  // standard amounts we use in our tests
  const dollars = 100;
  const daiAmount = tokenAmountToBigNumber(dollars, 18);
  const usdcAmount = tokenAmountToBigNumber(dollars, 6);
  const usdtAmount = tokenAmountToBigNumber(dollars, 6);

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [deployer, lpSafe, randomUser] = await ethers.getSigners();
    lpSafeAddress = lpSafe.address;

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

    await deployer.sendTransaction({
      to: ADMIN_SAFE,
      value: ethers.utils.parseEther("10").toHexString(),
    });
    const adminSafe = await impersonateAccount(ADMIN_SAFE);

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

    const initData = PoolTokenV2.interface.encodeFunctionData(
      "initializeUpgrade(address)",
      [APY_ADDRESS_REGISTRY]
    );
    await poolAdmin.upgradeAndCall(
      APY_DAI_POOL,
      newPoolLogic.address,
      initData
    );
    await poolAdmin.upgradeAndCall(
      APY_USDC_POOL,
      newPoolLogic.address,
      initData
    );
    await poolAdmin.upgradeAndCall(
      APY_USDT_POOL,
      newPoolLogic.address,
      initData
    );

    /*************************************/
    /***** Upgrade Address Registry ******/
    /*************************************/
    const AddressRegistryV2 = await ethers.getContractFactory(
      "AddressRegistryV2"
    );
    const addressRegistryLogicV2 = await AddressRegistryV2.deploy();
    const addressRegistryAdmin = await ethers.getContractAt(
      "ProxyAdmin",
      APY_REGISTRY_ADMIN,
      addressRegistryDeployer
    );

    await addressRegistryAdmin.upgrade(
      APY_ADDRESS_REGISTRY,
      addressRegistryLogicV2.address
    );

    addressRegistry = await ethers.getContractAt(
      "AddressRegistryV2",
      APY_ADDRESS_REGISTRY,
      adminSafe
    );

    /*********************************/
    /***** deploy Oracle Adapter *****/
    /*********************************/

    const network = "MAINNET";
    const symbols = ["DAI", "USDC", "USDT"];

    const tvlAggAddress = getAggregatorAddress("TVL", network);
    const assetAddresses = symbols.map((symbol) =>
      getStablecoinAddress(symbol, network)
    );
    const sourceAddresses = symbols.map((symbol) =>
      getAggregatorAddress(`${symbol}-USD`, network)
    );
    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    oracleAdapter = await OracleAdapter.deploy(
      addressRegistry.address,
      tvlAggAddress,
      assetAddresses,
      sourceAddresses,
      86400,
      270
    );
    await oracleAdapter.deployed();

    await addressRegistry.registerAddress(
      bytes32("oracleAdapter"),
      oracleAdapter.address
    );

    // set default TVL for tests to zero
    await oracleAdapter.lockFor(10);
    await oracleAdapter.setTvl(0, 100);
    await oracleAdapter.unlock();

    /***********************/
    /***** deploy mAPT *****/
    /***********************/
    /*
    Possibly we should use real aggregators here, i.e. deploy
    the TVL agg and connect to the Mainnet ETH-USD agg;
    however, it's unclear what additional confidence it adds
    to the tests for the additional complexity to update the
    TVL values.
    
    For example, we'd need to update the TVL agg with USD values
    which would either be off from the stablecoin amounts and
    possibly cause issues with allowed deviation levels, or we
    would need to use a stablecoin to USD conversion.

    As a final note, rather than dummy addresses, we deploy mocks,
    as we may add checks for contract addresses in the future.
    */

    const MetaPoolTokenProxy = await ethers.getContractFactory(
      "MetaPoolTokenProxy"
    );
    const MetaPoolToken = await ethers.getContractFactory("MetaPoolToken");

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    const logic = await MetaPoolToken.deploy();
    await logic.deployed();

    const mAptProxy = await MetaPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      addressRegistry.address
    );
    await mAptProxy.deployed();

    mApt = await MetaPoolToken.attach(mAptProxy.address);
    await addressRegistry.registerAddress(bytes32("mApt"), mApt.address);

    /***********************************/
    /***** deploy manager  *************/
    /***********************************/
    const PoolManager = await ethers.getContractFactory("PoolManager");
    const PoolManagerProxy = await ethers.getContractFactory(
      "PoolManagerProxy"
    );

    const managerAdmin = await ProxyAdmin.deploy();
    await managerAdmin.deployed();
    const managerLogic = await PoolManager.deploy();
    await managerLogic.deployed();
    const managerProxy = await PoolManagerProxy.deploy(
      managerLogic.address,
      managerAdmin.address,
      APY_ADDRESS_REGISTRY
    );
    await managerProxy.deployed();
    poolManager = await PoolManager.attach(managerProxy.address);

    await addressRegistry.registerAddress(
      ethers.utils.formatBytes32String("poolManager"),
      poolManager.address
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
    await daiPool.infiniteApprove(poolManager.address);
    await usdcPool.infiniteApprove(poolManager.address);
    await usdtPool.infiniteApprove(poolManager.address);

    await addressRegistry.registerAddress(
      ethers.utils.formatBytes32String("lpSafe"),
      lpSafeAddress
    );

    /*******************************************/
    /***** deploy asset allocation registry ****/
    /*******************************************/
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

    // manager needs to be approved to transfer tokens from funded account
    await daiToken.connect(lpSafe).approve(poolManager.address, daiAmount);
    await usdcToken.connect(lpSafe).approve(poolManager.address, usdcAmount);
    await usdtToken.connect(lpSafe).approve(poolManager.address, usdtAmount);
  });

  async function getMintAmount(pool, underlyerAmount) {
    const tokenPrice = await pool.getUnderlyerPrice();
    const underlyer = await pool.underlyer();
    const erc20 = await ethers.getContractAt(IDetailedERC20.abi, underlyer);
    const decimals = await erc20.decimals();
    const mintAmount = await mApt.calculateMintAmount(
      underlyerAmount,
      tokenPrice,
      decimals
    );
    return mintAmount;
  }

  describe("fundLpSafe", () => {
    // standard amounts we use in our tests
    const dollars = 100;
    const daiAmount = tokenAmountToBigNumber(dollars, 18);
    const usdcAmount = tokenAmountToBigNumber(dollars, 6);
    const usdtAmount = tokenAmountToBigNumber(dollars, 6);

    it("Non-owner cannot call", async () => {
      await expect(
        poolManager.connect(randomUser).fundLpSafe([])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can call", async () => {
      await expect(poolManager.connect(deployer).fundLpSafe([])).to.not.be
        .reverted;
    });

    it("Revert on missing LP Safe address", async () => {
      await addressRegistry.deleteAddress(bytes32("lpSafe"));
      await expect(poolManager.connect(deployer).fundLpSafe([])).to.be.reverted;
    });

    it("Revert on unregistered pool", async () => {
      await expect(
        poolManager.fundLpSafe([
          { poolId: bytes32("daiPool"), amount: 10 },
          { poolId: bytes32("invalidPoolId"), amount: 10 },
          { poolId: bytes32("usdtPool"), amount: 10 },
        ])
      ).to.be.revertedWith("Missing address");
    });

    it("Revert on zero amount", async () => {
      await expect(
        poolManager
          .connect(deployer)
          .fundLpSafe([{ poolId: bytes32("usdcPool"), amount: 0 }])
      ).to.be.revertedWith("INVALID_AMOUNT");
    });

    it("First funding updates balances and registers asset allocations (single pool)", async () => {
      // pre-conditions
      expect(await daiToken.balanceOf(lpSafeAddress)).to.equal(0);
      expect(await mApt.totalSupply()).to.equal(0);

      /***********************************************/
      /* Test all balances are updated appropriately */
      /***********************************************/
      const daiPoolBalance = await daiToken.balanceOf(daiPool.address);

      const daiPoolMintAmount = await getMintAmount(daiPool, daiAmount);

      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: daiAmount },
      ]);

      const strategyDaiBalance = await daiToken.balanceOf(lpSafeAddress);

      // Check underlyer amounts transferred correctly
      expect(strategyDaiBalance).to.equal(daiAmount);

      expect(await daiToken.balanceOf(daiPool.address)).to.equal(
        daiPoolBalance.sub(daiAmount)
      );

      // Check proper mAPT amounts minted
      expect(await mApt.balanceOf(daiPool.address)).to.equal(daiPoolMintAmount);

      /*************************************************************/
      /* Check pool manager registered asset allocations correctly */
      /*************************************************************/

      const encodedBalanceOf = erc20Interface.encodeFunctionData(
        "balanceOf(address)",
        [lpSafeAddress]
      );
      const expectedDaiId = await tvlManager.generateDataHash([
        daiToken.address,
        encodedBalanceOf,
      ]);

      const registeredIds = await tvlManager.getAssetAllocationIds();
      expect(registeredIds.length).to.equal(1);
      expect(registeredIds[0]).to.equal(expectedDaiId);

      const registeredDaiSymbol = await tvlManager.symbolOf(registeredIds[0]);
      expect(registeredDaiSymbol).to.equal("DAI");

      const registeredDaiDecimals = await tvlManager.decimalsOf(
        registeredIds[0]
      );
      expect(registeredDaiDecimals).to.equal(18);

      const registeredStratDaiBal = await tvlManager.balanceOf(
        registeredIds[0]
      );
      expect(registeredStratDaiBal).equal(strategyDaiBalance);
    });

    it("First funding updates balances and registers asset allocations (multiple pools)", async () => {
      // pre-conditions
      expect(await daiToken.balanceOf(lpSafeAddress)).to.equal(0);
      expect(await usdcToken.balanceOf(lpSafeAddress)).to.equal(0);
      expect(await usdtToken.balanceOf(lpSafeAddress)).to.equal(0);
      expect(await mApt.totalSupply()).to.equal(0);

      /***********************************************/
      /* Test all balances are updated appropriately */
      /***********************************************/
      const daiPoolBalance = await daiToken.balanceOf(daiPool.address);
      const usdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
      const usdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);

      const daiPoolMintAmount = await getMintAmount(daiPool, daiAmount);
      const usdcPoolMintAmount = await getMintAmount(usdcPool, usdcAmount);
      const usdtPoolMintAmount = await getMintAmount(usdtPool, usdtAmount);

      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: daiAmount },
        { poolId: bytes32("usdcPool"), amount: usdcAmount },
        { poolId: bytes32("usdtPool"), amount: usdtAmount },
      ]);

      const strategyDaiBalance = await daiToken.balanceOf(lpSafeAddress);
      const strategyUsdcBalance = await usdcToken.balanceOf(lpSafeAddress);
      const strategyUsdtBalance = await usdtToken.balanceOf(lpSafeAddress);

      // Check underlyer amounts transferred correctly
      expect(strategyDaiBalance).to.equal(daiAmount);
      expect(strategyUsdcBalance).to.equal(usdcAmount);
      expect(strategyUsdtBalance).to.equal(usdtAmount);

      expect(await daiToken.balanceOf(daiPool.address)).to.equal(
        daiPoolBalance.sub(daiAmount)
      );
      expect(await usdcToken.balanceOf(usdcPool.address)).to.equal(
        usdcPoolBalance.sub(usdcAmount)
      );
      expect(await usdtToken.balanceOf(usdtPool.address)).to.equal(
        usdtPoolBalance.sub(usdtAmount)
      );

      // Check proper mAPT amounts minted
      expect(await mApt.balanceOf(daiPool.address)).to.equal(daiPoolMintAmount);
      expect(await mApt.balanceOf(usdcPool.address)).to.equal(
        usdcPoolMintAmount
      );
      expect(await mApt.balanceOf(usdtPool.address)).to.equal(
        usdtPoolMintAmount
      );

      /*************************************************************/
      /* Check pool manager registered asset allocations correctly */
      /*************************************************************/

      const encodedBalanceOf = erc20Interface.encodeFunctionData(
        "balanceOf(address)",
        [lpSafeAddress]
      );
      const expectedDaiId = await tvlManager.generateDataHash([
        daiToken.address,
        encodedBalanceOf,
      ]);
      const expectedUsdcId = await tvlManager.generateDataHash([
        usdcToken.address,
        encodedBalanceOf,
      ]);
      const expectedUsdtId = await tvlManager.generateDataHash([
        usdtToken.address,
        encodedBalanceOf,
      ]);

      const registeredIds = await tvlManager.getAssetAllocationIds();
      expect(registeredIds.length).to.equal(3);
      expect(registeredIds[0]).to.equal(expectedDaiId);
      expect(registeredIds[1]).to.equal(expectedUsdcId);
      expect(registeredIds[2]).to.equal(expectedUsdtId);

      const registeredDaiSymbol = await tvlManager.symbolOf(registeredIds[0]);
      const registeredUsdcSymbol = await tvlManager.symbolOf(registeredIds[1]);
      const registeredUsdtSymbol = await tvlManager.symbolOf(registeredIds[2]);
      expect(registeredDaiSymbol).to.equal("DAI");
      expect(registeredUsdcSymbol).to.equal("USDC");
      expect(registeredUsdtSymbol).to.equal("USDT");

      const registeredDaiDecimals = await tvlManager.decimalsOf(
        registeredIds[0]
      );
      const registeredUsdcDecimals = await tvlManager.decimalsOf(
        registeredIds[1]
      );
      const registeredUsdtDecimals = await tvlManager.decimalsOf(
        registeredIds[2]
      );
      expect(registeredDaiDecimals).to.equal(18);
      expect(registeredUsdcDecimals).to.equal(6);
      expect(registeredUsdtDecimals).to.equal(6);

      const registeredStratDaiBal = await tvlManager.balanceOf(
        registeredIds[0]
      );
      const registeredStratUsdcBal = await tvlManager.balanceOf(
        registeredIds[1]
      );
      const registeredStratUsdtBal = await tvlManager.balanceOf(
        registeredIds[2]
      );
      expect(registeredStratDaiBal).equal(strategyDaiBalance);
      expect(registeredStratUsdcBal).equal(strategyUsdcBalance);
      expect(registeredStratUsdtBal).equal(strategyUsdtBalance);
    });

    it("Second funding updates balances (single pool)", async () => {
      // pre-conditions
      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: daiAmount },
      ]);
      expect(await daiToken.balanceOf(lpSafeAddress)).to.be.gt(0);
      expect(await mApt.totalSupply()).to.be.gt(0);

      // adjust the TVL appropriately, as there is no Chainlink to update it
      await oracleAdapter.unlock(); // needed to get value
      const tvl = await daiPool.getValueFromUnderlyerAmount(daiAmount);
      await oracleAdapter.lock();
      await oracleAdapter.setTvl(tvl, 100);
      await oracleAdapter.unlock();

      /***********************************************/
      /* Test all balances are updated appropriately */
      /***********************************************/
      const prevPoolBalance = await daiToken.balanceOf(daiPool.address);
      const prevStrategyBalance = await daiToken.balanceOf(lpSafeAddress);
      const prevMaptBalance = await mApt.balanceOf(daiPool.address);

      const transferAmount = daiAmount.mul(3);
      const mintAmount = await getMintAmount(daiPool, transferAmount);

      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: transferAmount },
      ]);

      const newPoolBalance = await daiToken.balanceOf(daiPool.address);
      const newStrategyBalance = await daiToken.balanceOf(lpSafeAddress);
      const newMaptBalance = await mApt.balanceOf(daiPool.address);

      // Check underlyer amounts transferred correctly
      expect(prevPoolBalance.sub(newPoolBalance)).to.equal(transferAmount);
      expect(newStrategyBalance.sub(prevStrategyBalance)).to.equal(
        transferAmount
      );

      // Check proper mAPT amounts minted
      expect(newMaptBalance.sub(prevMaptBalance)).to.equal(mintAmount);
    });

    it("Second funding updates balances (multiple pools)", async () => {
      // pre-conditions
      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: daiAmount },
        { poolId: bytes32("usdcPool"), amount: usdcAmount },
        { poolId: bytes32("usdtPool"), amount: usdtAmount },
      ]);
      expect(await daiToken.balanceOf(lpSafeAddress)).to.be.gt(0);
      expect(await usdcToken.balanceOf(lpSafeAddress)).to.be.gt(0);
      expect(await usdtToken.balanceOf(lpSafeAddress)).to.be.gt(0);
      expect(await mApt.totalSupply()).to.be.gt(0);

      // adjust the TVL appropriately, as there is no Chainlink to update it
      await oracleAdapter.unlock(); // needed to get value
      const daiValue = await daiPool.getValueFromUnderlyerAmount(daiAmount);
      const usdcValue = await usdcPool.getValueFromUnderlyerAmount(usdcAmount);
      const usdtValue = await usdtPool.getValueFromUnderlyerAmount(usdtAmount);
      const tvl = daiValue.add(usdcValue).add(usdtValue);
      await oracleAdapter.lock();
      await oracleAdapter.setTvl(tvl, 100);
      await oracleAdapter.unlock();

      /***********************************************/
      /* Test all balances are updated appropriately */
      /***********************************************/
      // DAI
      const prevDaiPoolBalance = await daiToken.balanceOf(daiPool.address);
      const prevSafeDaiBalance = await daiToken.balanceOf(lpSafeAddress);
      const prevDaiPoolMaptBalance = await mApt.balanceOf(daiPool.address);
      // USDC
      const prevUsdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
      const prevSafeUsdcBalance = await usdcToken.balanceOf(lpSafeAddress);
      const prevUsdcPoolMaptBalance = await mApt.balanceOf(usdcPool.address);
      // Tether
      const prevUsdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);
      const prevSafeUsdtBalance = await usdtToken.balanceOf(lpSafeAddress);
      const prevUsdtPoolMaptBalance = await mApt.balanceOf(usdtPool.address);

      const daiTransferAmount = daiAmount.mul(3);
      const usdcTransferAmount = usdcAmount.mul(2).div(3);
      const usdtTransferAmount = usdtAmount.div(2);

      const daiPoolMintAmount = await getMintAmount(daiPool, daiTransferAmount);
      const usdcPoolMintAmount = await getMintAmount(
        usdcPool,
        usdcTransferAmount
      );
      const usdtPoolMintAmount = await getMintAmount(
        usdtPool,
        usdtTransferAmount
      );

      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: daiTransferAmount },
        { poolId: bytes32("usdcPool"), amount: usdcTransferAmount },
        { poolId: bytes32("usdtPool"), amount: usdtTransferAmount },
      ]);

      const newDaiPoolBalance = await daiToken.balanceOf(daiPool.address);
      const newSafeDaiBalance = await daiToken.balanceOf(lpSafeAddress);
      const newDaiPoolMaptBalance = await mApt.balanceOf(daiPool.address);

      const newUsdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
      const newSafeUsdcBalance = await usdcToken.balanceOf(lpSafeAddress);
      const newUsdcPoolMaptBalance = await mApt.balanceOf(usdcPool.address);

      const newUsdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);
      const newSafeUsdtBalance = await usdtToken.balanceOf(lpSafeAddress);
      const newUsdtPoolMaptBalance = await mApt.balanceOf(usdtPool.address);

      // Check underlyer amounts transferred correctly
      expect(prevDaiPoolBalance.sub(newDaiPoolBalance)).to.equal(
        daiTransferAmount
      );
      expect(newSafeDaiBalance.sub(prevSafeDaiBalance)).to.equal(
        daiTransferAmount
      );
      expect(prevUsdcPoolBalance.sub(newUsdcPoolBalance)).to.equal(
        usdcTransferAmount
      );
      expect(newSafeUsdcBalance.sub(prevSafeUsdcBalance)).to.equal(
        usdcTransferAmount
      );
      expect(prevUsdtPoolBalance.sub(newUsdtPoolBalance)).to.equal(
        usdtTransferAmount
      );
      expect(newSafeUsdtBalance.sub(prevSafeUsdtBalance)).to.equal(
        usdtTransferAmount
      );

      // Check proper mAPT amounts minted
      expect(newDaiPoolMaptBalance.sub(prevDaiPoolMaptBalance)).to.equal(
        daiPoolMintAmount
      );
      expect(newUsdcPoolMaptBalance.sub(prevUsdcPoolMaptBalance)).to.equal(
        usdcPoolMintAmount
      );
      expect(newUsdtPoolMaptBalance.sub(prevUsdtPoolMaptBalance)).to.equal(
        usdtPoolMintAmount
      );
    });
  });

  describe("withdrawFromLpSafe", () => {
    it("Non-owner cannot call", async () => {
      await expect(
        poolManager.connect(randomUser).withdrawFromLpSafe([])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can call", async () => {
      await expect(poolManager.connect(deployer).withdrawFromLpSafe([])).to.not
        .be.reverted;
    });

    it("Revert on missing LP Safe address", async () => {
      await addressRegistry.deleteAddress(bytes32("lpSafe"));
      await expect(
        poolManager.connect(deployer).withdrawFromLpSafe([])
      ).to.be.revertedWith("Missing address");
    });

    it("Revert on unregistered pool", async () => {
      await expect(
        poolManager.withdrawFromLpSafe([
          { poolId: bytes32("invalidPool"), amount: 10 },
        ])
      ).to.be.revertedWith("Missing address");
    });

    it("Revert on zero amount", async () => {
      await expect(
        poolManager
          .connect(deployer)
          .withdrawFromLpSafe([{ poolId: bytes32("usdcPool"), amount: 0 }])
      ).to.be.revertedWith("INVALID_AMOUNT");
    });

    it("Revert with specified reason for insufficient allowance", async () => {
      const amount = "10";
      await daiToken.connect(deployer).transfer(lpSafeAddress, amount);

      await daiToken.connect(lpSafe).approve(poolManager.address, 0);

      await expect(
        poolManager.withdrawFromLpSafe([
          { poolId: bytes32("daiPool"), amount: amount },
        ])
      ).to.be.revertedWith("INSUFFICIENT_ALLOWANCE");
    });

    it("Updates balances correctly (single pool)", async () => {
      const transferAmount = tokenAmountToBigNumber("10", 18);
      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: transferAmount },
      ]);

      // adjust the TVL appropriately, as there is no Chainlink to update it
      await oracleAdapter.unlock(); // needed to get value
      const tvl = await daiPool.getValueFromUnderlyerAmount(transferAmount);
      await oracleAdapter.lock();
      await oracleAdapter.setTvl(tvl, 100);
      await oracleAdapter.unlock();

      const prevSafeBalance = await daiToken.balanceOf(lpSafeAddress);
      const prevPoolBalance = await daiToken.balanceOf(daiPool.address);
      const prevMaptBalance = await mApt.balanceOf(daiPool.address);

      const burnAmount = await getMintAmount(daiPool, transferAmount);

      await poolManager.withdrawFromLpSafe([
        { poolId: bytes32("daiPool"), amount: transferAmount },
      ]);

      const newSafeBalance = await daiToken.balanceOf(lpSafeAddress);
      const newPoolBalance = await daiToken.balanceOf(daiPool.address);
      expect(prevSafeBalance.sub(newSafeBalance)).to.equal(transferAmount);
      expect(newPoolBalance.sub(prevPoolBalance)).to.equal(transferAmount);

      const allowedDeviation = 2;

      const newMaptBalance = await mApt.balanceOf(daiPool.address);
      const expectedMaptBalance = prevMaptBalance.sub(burnAmount);
      expect(newMaptBalance.sub(expectedMaptBalance).abs()).lt(
        allowedDeviation
      );
    });

    it("Updates balances correctly (multiple pools)", async () => {
      const daiTransferAmount = tokenAmountToBigNumber("10", 18);
      const usdcTransferAmount = tokenAmountToBigNumber("25", 6);
      const usdtTransferAmount = tokenAmountToBigNumber("8", 6);
      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: daiTransferAmount },
        { poolId: bytes32("usdcPool"), amount: usdcTransferAmount },
        { poolId: bytes32("usdtPool"), amount: usdtTransferAmount },
      ]);

      // adjust the TVL appropriately, as there is no Chainlink to update it
      await oracleAdapter.unlock(); // needed to get value
      const daiValue = await daiPool.getValueFromUnderlyerAmount(
        daiTransferAmount
      );
      const usdcValue = await usdcPool.getValueFromUnderlyerAmount(
        usdcTransferAmount
      );
      const usdtValue = await usdtPool.getValueFromUnderlyerAmount(
        usdtTransferAmount
      );
      const tvl = daiValue.add(usdcValue).add(usdtValue);
      await oracleAdapter.lock();
      await oracleAdapter.setTvl(tvl, 100);
      await oracleAdapter.unlock();

      // DAI
      const prevSafeDaiBalance = await daiToken.balanceOf(lpSafeAddress);
      const prevDaiPoolBalance = await daiToken.balanceOf(daiPool.address);
      const prevDaiMaptBalance = await mApt.balanceOf(daiPool.address);
      // USDC
      const prevSafeUsdcBalance = await usdcToken.balanceOf(lpSafeAddress);
      const prevUsdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
      const prevUsdcMaptBalance = await mApt.balanceOf(usdcPool.address);
      // USDT
      const prevSafeUsdtBalance = await usdtToken.balanceOf(lpSafeAddress);
      const prevUsdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);
      const prevUsdtMaptBalance = await mApt.balanceOf(usdtPool.address);

      const daiPoolBurnAmount = await getMintAmount(daiPool, daiTransferAmount);
      const usdcPoolBurnAmount = await getMintAmount(
        usdcPool,
        usdcTransferAmount
      );
      const usdtPoolBurnAmount = await getMintAmount(
        usdtPool,
        usdtTransferAmount
      );

      await poolManager.withdrawFromLpSafe([
        { poolId: bytes32("daiPool"), amount: daiTransferAmount },
        { poolId: bytes32("usdcPool"), amount: usdcTransferAmount },
        { poolId: bytes32("usdtPool"), amount: usdtTransferAmount },
      ]);

      /****************************/
      /* check underlyer balances */
      /****************************/

      // DAI
      const newSafeDaiBalance = await daiToken.balanceOf(lpSafeAddress);
      const newDaiPoolBalance = await daiToken.balanceOf(daiPool.address);
      expect(prevSafeDaiBalance.sub(newSafeDaiBalance)).to.equal(
        daiTransferAmount
      );
      expect(newDaiPoolBalance.sub(prevDaiPoolBalance)).to.equal(
        daiTransferAmount
      );
      // USDC
      const newSafeUsdcBalance = await usdcToken.balanceOf(lpSafeAddress);
      const newUsdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
      expect(prevSafeUsdcBalance.sub(newSafeUsdcBalance)).to.equal(
        usdcTransferAmount
      );
      expect(newUsdcPoolBalance.sub(prevUsdcPoolBalance)).to.equal(
        usdcTransferAmount
      );
      // USDT
      const newSafeUsdtBalance = await daiToken.balanceOf(lpSafeAddress);
      const newUsdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);
      expect(prevSafeUsdtBalance.sub(newSafeUsdtBalance)).to.equal(
        usdtTransferAmount
      );
      expect(newUsdtPoolBalance.sub(prevUsdtPoolBalance)).to.equal(
        usdtTransferAmount
      );

      /***********************/
      /* check mAPT balances */
      /***********************/

      const allowedDeviation = 2;
      // DAI
      const newDaiMaptBalance = await mApt.balanceOf(daiPool.address);
      const expectedDaiMaptBalance = prevDaiMaptBalance.sub(daiPoolBurnAmount);
      expect(newDaiMaptBalance.sub(expectedDaiMaptBalance).abs()).lt(
        allowedDeviation
      );
      // USDC
      const newUsdcMaptBalance = await mApt.balanceOf(usdcPool.address);
      const expectedUsdcMaptBalance = prevUsdcMaptBalance.sub(
        usdcPoolBurnAmount
      );
      expect(newUsdcMaptBalance.sub(expectedUsdcMaptBalance).abs()).lt(
        allowedDeviation
      );
      // USDT
      const newUsdtMaptBalance = await mApt.balanceOf(usdtPool.address);
      const expectedUsdtMaptBalance = prevUsdtMaptBalance.sub(
        usdtPoolBurnAmount
      );
      expect(newUsdtMaptBalance.sub(expectedUsdtMaptBalance).abs()).lt(
        allowedDeviation
      );
    });
  });

  describe("Withdrawing after funding", () => {
    it("Full withdrawal reverts if TVL not updated", async () => {
      let totalTransferred = tokenAmountToBigNumber(0, 18);
      let transferAmount = daiAmount.div(2);
      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: transferAmount },
      ]);
      totalTransferred = totalTransferred.add(transferAmount);

      // adjust the tvl appropriately, as there is no chainlink to update it
      await oracleAdapter.unlock(); // needed to get value
      let tvl = await daiPool.getValueFromUnderlyerAmount(transferAmount);
      await oracleAdapter.lock();
      await oracleAdapter.setTvl(tvl, 100);
      await oracleAdapter.unlock();

      transferAmount = daiAmount.div(3);
      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: transferAmount },
      ]);
      await oracleAdapter.unlock();
      totalTransferred = totalTransferred.add(transferAmount);

      await expect(
        poolManager.withdrawFromLpSafe([
          { poolId: bytes32("daiPool"), amount: totalTransferred },
        ])
      ).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });

    it("Full withdrawal works if TVL updated", async () => {
      expect(await mApt.balanceOf(daiPool.address)).to.equal(0);
      const poolBalance = await daiToken.balanceOf(daiPool.address);

      let totalTransferred = tokenAmountToBigNumber(0, 18);
      let transferAmount = daiAmount.div(2);
      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: transferAmount },
      ]);
      totalTransferred = totalTransferred.add(transferAmount);

      // adjust the tvl appropriately, as there is no chainlink to update it
      await oracleAdapter.unlock(); // needed to get value
      let tvl = await daiPool.getValueFromUnderlyerAmount(totalTransferred);
      await oracleAdapter.lock();
      await oracleAdapter.setTvl(tvl, 100);
      await oracleAdapter.unlock();

      transferAmount = daiAmount.div(3);
      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: transferAmount },
      ]);
      await oracleAdapter.unlock();
      totalTransferred = totalTransferred.add(transferAmount);

      // adjust the tvl appropriately, as there is no chainlink to update it
      await oracleAdapter.unlock(); // needed to get value
      tvl = await daiPool.getValueFromUnderlyerAmount(totalTransferred);
      await oracleAdapter.lock();
      await oracleAdapter.setTvl(tvl, 100);
      await oracleAdapter.unlock();

      await poolManager.withdrawFromLpSafe([
        { poolId: bytes32("daiPool"), amount: totalTransferred },
      ]);

      expect(await mApt.balanceOf(daiPool.address)).to.equal(0);
      expect(await daiToken.balanceOf(daiPool.address)).to.equal(poolBalance);
    });
  });
});
