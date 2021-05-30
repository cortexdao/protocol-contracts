const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  impersonateAccount,
  bytes32,
  acquireToken,
  getStablecoinAddress,
} = require("../utils/helpers");
const erc20Interface = new ethers.utils.Interface(
  artifacts.require("ERC20").abi
);
const { deployMockContract } = require("ethereum-waffle");
const { STABLECOIN_POOLS } = require("../utils/constants");

const IDetailedERC20 = artifacts.require("IDetailedERC20");

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

describe("Contract: PoolManager", () => {
  // to-be-deployed contracts
  let poolManager;
  let tvlManager;
  let mApt;
  let oracleAdapter;

  // signers
  let deployer;
  let fundedAccount; // mock for LP Safe instance
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
  let fundedAccountAddress;

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
    [deployer, fundedAccount, randomUser] = await ethers.getSigners();
    fundedAccountAddress = fundedAccount.address;

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
    const AddressRegistryFactory = await ethers.getContractFactory(
      "AddressRegistryV2"
    );
    const newAddressRegistryLogic = await AddressRegistryFactory.deploy();
    const registryAdmin = await ethers.getContractAt(
      "ProxyAdmin",
      APY_REGISTRY_ADMIN,
      addressRegistryDeployer
    );

    await registryAdmin.upgrade(
      APY_ADDRESS_REGISTRY,
      newAddressRegistryLogic.address
    );

    addressRegistry = await ethers.getContractAt(
      "AddressRegistryV2",
      APY_ADDRESS_REGISTRY,
      addressRegistryDeployer
    );

    /*********************************/
    /***** deploy Oracle Adapter *****/
    /*********************************/

    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    const tvlAgg = await deployMockContract(deployer, []);
    oracleAdapter = await OracleAdapter.deploy([], [], tvlAgg.address, 86400);
    await oracleAdapter.deployed();

    await addressRegistry.registerAddress(
      bytes32("oracleAdapter"),
      oracleAdapter.address
    );

    // set default TVL for tests to zero
    await oracleAdapter.setLock(10);
    await oracleAdapter.setTvl(0, 100);
    await oracleAdapter.setLock(0);

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
      fundedAccountAddress
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

    // used for test setups needing minting of mAPT
    let managerSigner;

    /** needed for the manager to be able to mint mAPT in test setups */
    before("Setup manager for sending transactions", async () => {
      managerSigner = await impersonateAccount(poolManager);
      await deployer.sendTransaction({
        to: poolManager.address,
        value: ethers.utils.parseEther("10").toHexString(),
      });
    });

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

    it("Transfers correct underlyer amounts and updates asset allocation registry", async () => {
      // pre-conditions
      expect(await daiToken.balanceOf(fundedAccountAddress)).to.equal(0);
      expect(await usdcToken.balanceOf(fundedAccountAddress)).to.equal(0);
      expect(await usdtToken.balanceOf(fundedAccountAddress)).to.equal(0);

      // start the tests
      const daiPoolBalance = await daiToken.balanceOf(daiPool.address);
      const usdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
      const usdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);

      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: daiAmount },
        { poolId: bytes32("usdcPool"), amount: usdcAmount },
        { poolId: bytes32("usdtPool"), amount: usdtAmount },
      ]);

      const strategyDaiBalance = await daiToken.balanceOf(fundedAccountAddress);
      const strategyUsdcBalance = await usdcToken.balanceOf(
        fundedAccountAddress
      );
      const strategyUsdtBalance = await usdtToken.balanceOf(
        fundedAccountAddress
      );

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

      const encodedBalanceOf = erc20Interface.encodeFunctionData(
        "balanceOf(address)",
        [fundedAccountAddress]
      );

      // Check the manager registered the asset allocations corretly
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

    it("Mints correct mAPT amounts (start with non-zero supply)", async () => {
      // pre-conditions
      expect(await mApt.balanceOf(daiPool.address)).to.equal("0");
      expect(await mApt.balanceOf(usdcToken.address)).to.equal("0");
      expect(await mApt.balanceOf(usdtToken.address)).to.equal("0");

      await mApt
        .connect(managerSigner)
        .mint(deployer.address, tokenAmountToBigNumber("100"));

      // start the test
      const daiPoolMintAmount = await getMintAmount(daiPool, daiAmount);
      const usdcPoolMintAmount = await getMintAmount(usdcPool, usdcAmount);
      const usdtPoolMintAmount = await getMintAmount(usdtPool, usdtAmount);

      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: daiAmount },
        { poolId: bytes32("usdcPool"), amount: usdcAmount },
        { poolId: bytes32("usdtPool"), amount: usdtAmount },
      ]);

      expect(await mApt.balanceOf(daiPool.address)).to.equal(daiPoolMintAmount);
      expect(await mApt.balanceOf(usdcPool.address)).to.equal(
        usdcPoolMintAmount
      );
      expect(await mApt.balanceOf(usdtPool.address)).to.equal(
        usdtPoolMintAmount
      );
    });

    it("Mints correct mAPT amounts (start with zero supply)", async () => {
      // pre-conditions
      expect(await mApt.totalSupply()).to.equal(0);

      // start the test
      const daiPoolMintAmount = await getMintAmount(daiPool, daiAmount);
      const usdcPoolMintAmount = await getMintAmount(usdcPool, usdcAmount);
      const usdtPoolMintAmount = await getMintAmount(usdtPool, usdtAmount);

      await poolManager.fundLpSafe([
        { poolId: bytes32("daiPool"), amount: daiAmount },
        { poolId: bytes32("usdcPool"), amount: usdcAmount },
        { poolId: bytes32("usdtPool"), amount: usdtAmount },
      ]);

      expect(await mApt.balanceOf(daiPool.address)).to.equal(daiPoolMintAmount);
      expect(await mApt.balanceOf(usdcPool.address)).to.equal(
        usdcPoolMintAmount
      );
      expect(await mApt.balanceOf(usdtPool.address)).to.equal(
        usdtPoolMintAmount
      );
    });
  });

  describe("Withdrawing", () => {
    // standard amounts we use in our tests
    const dollars = 100;
    const daiAmount = tokenAmountToBigNumber(dollars, 18);
    const usdcAmount = tokenAmountToBigNumber(dollars, 6);
    const usdtAmount = tokenAmountToBigNumber(dollars, 6);

    // used for test setups needing minting of mAPT
    let managerSigner;

    /** manager needs to be approved to transfer tokens from funded account */
    before("Approve manager for transfer from funded account", async () => {
      await daiToken
        .connect(fundedAccount)
        .approve(poolManager.address, daiAmount);
      await usdcToken
        .connect(fundedAccount)
        .approve(poolManager.address, usdcAmount);
      await usdtToken
        .connect(fundedAccount)
        .approve(poolManager.address, usdtAmount);
    });

    /** needed for the manager to be able to mint mAPT in test setups */
    before("Setup manager for sending transactions", async () => {
      await impersonateAccount(poolManager);
      await deployer.sendTransaction({
        to: poolManager.address,
        value: ethers.utils.parseEther("10").toHexString(),
      });
      managerSigner = await ethers.provider.getSigner(poolManager.address);
    });

    describe("withdrawFromLpSafe", () => {
      it("Non-owner cannot call", async () => {
        await expect(
          poolManager.connect(randomUser).withdrawFromLpSafe([])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Owner can call", async () => {
        await expect(poolManager.connect(deployer).withdrawFromLpSafe([])).to
          .not.be.reverted;
      });

      it("Revert on missing LP Safe address", async () => {
        await addressRegistry.deleteAddress(bytes32("lpSafe"));
        await expect(poolManager.connect(deployer).withdrawFromLpSafe([])).to.be
          .reverted;
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
        await daiToken.connect(deployer).transfer(fundedAccountAddress, amount);

        await daiToken.connect(fundedAccount).approve(poolManager.address, 0);

        await expect(
          poolManager.withdrawFromLpSafe([
            { poolId: bytes32("daiPool"), amount: amount },
          ])
        ).to.be.revertedWith("INSUFFICIENT_ALLOWANCE");
      });

      it("Transfers underlyer correctly for one pool", async () => {
        const amount = tokenAmountToBigNumber("10", 18);
        await daiToken.connect(deployer).transfer(fundedAccountAddress, amount);
        expect(await daiToken.balanceOf(fundedAccountAddress)).to.equal(amount);

        // now mint so withdraw can burn tokens
        const mintAmount = await getMintAmount(daiPool, amount);
        await mApt.connect(managerSigner).mint(daiPool.address, mintAmount);

        // adjust the TVL appropriately, as there is no Chainlink to update it
        const tvl = await daiPool.getValueFromUnderlyerAmount(amount);
        await oracleAdapter.setLock(10);
        await oracleAdapter.setTvl(tvl, 100);
        await oracleAdapter.setLock(0);

        await poolManager.withdrawFromLpSafe([
          { poolId: bytes32("daiPool"), amount: amount },
        ]);

        expect(await daiToken.balanceOf(fundedAccountAddress)).to.equal(0);
      });

      it("Transfers and mints correctly for multiple pools (start from zero supply)", async () => {
        expect(await mApt.totalSupply()).to.equal(0);
        expect(await mApt.getTvl()).to.equal(0);

        // now mint for each pool so withdraw can burn tokens
        const daiPoolMintAmount = await getMintAmount(daiPool, daiAmount);
        const usdcPoolMintAmount = await getMintAmount(usdcPool, usdcAmount);
        const usdtPoolMintAmount = await getMintAmount(usdtPool, usdtAmount);

        await mApt
          .connect(managerSigner)
          .mint(daiPool.address, daiPoolMintAmount);
        await mApt
          .connect(managerSigner)
          .mint(usdcPool.address, usdcPoolMintAmount);
        await mApt
          .connect(managerSigner)
          .mint(usdtPool.address, usdtPoolMintAmount);

        // transfer stablecoin to each pool to be able to withdraw
        await daiToken
          .connect(deployer)
          .transfer(fundedAccountAddress, daiAmount);
        await usdcToken
          .connect(deployer)
          .transfer(fundedAccountAddress, usdcAmount);
        await usdtToken
          .connect(deployer)
          .transfer(fundedAccountAddress, usdtAmount);
        // also adjust the TVL appropriately, as there is no Chainlink to update it
        const daiValue = await daiPool.getValueFromUnderlyerAmount(daiAmount);
        const usdcValue = await usdcPool.getValueFromUnderlyerAmount(
          usdcAmount
        );
        const usdtValue = await usdtPool.getValueFromUnderlyerAmount(
          usdtAmount
        );
        const newTvl = daiValue.add(usdcValue).add(usdtValue);
        await oracleAdapter.setLock(10);
        await oracleAdapter.setTvl(newTvl, 100);
        await oracleAdapter.setLock(0);

        const daiWithdrawAmount = daiAmount.div(2);
        const daiPoolBurnAmount = await getMintAmount(
          daiPool,
          daiWithdrawAmount
        );
        const usdcWithdrawAmount = usdcAmount.div(5);
        const usdcPoolBurnAmount = await getMintAmount(
          usdcPool,
          usdcWithdrawAmount
        );
        const usdtWithdrawAmount = usdtAmount;
        const usdtPoolBurnAmount = await getMintAmount(
          usdtPool,
          usdtWithdrawAmount
        );

        await poolManager.withdrawFromLpSafe([
          { poolId: bytes32("daiPool"), amount: daiWithdrawAmount },
          {
            poolId: bytes32("usdcPool"),
            amount: usdcWithdrawAmount,
          },
          {
            poolId: bytes32("usdtPool"),
            amount: usdtWithdrawAmount,
          },
        ]);

        const allowedDeviation = 2;

        let expectedBalance = daiPoolMintAmount.sub(daiPoolBurnAmount);
        let balance = await mApt.balanceOf(daiPool.address);
        expect(balance.sub(expectedBalance).abs()).lt(allowedDeviation);

        expectedBalance = usdcPoolMintAmount.sub(usdcPoolBurnAmount);
        balance = await mApt.balanceOf(usdcPool.address);
        expect(balance.sub(expectedBalance).abs()).lt(allowedDeviation);

        expectedBalance = usdtPoolMintAmount.sub(usdtPoolBurnAmount);
        balance = await mApt.balanceOf(usdtPool.address);
        expect(balance.sub(expectedBalance).abs()).lt(allowedDeviation);
      });

      it("Transfers and mints correctly for multiple pools (start from non-zero supply)", async () => {
        // make mAPT total supply non-zero by minting to deployer
        await mApt
          .connect(managerSigner)
          .mint(deployer.address, tokenAmountToBigNumber("1000000"));
        // don't forget to update the TVL!
        const tvl = tokenAmountToBigNumber("85000");
        await oracleAdapter.setLock(10);
        await oracleAdapter.setTvl(tvl, 100);
        await oracleAdapter.setLock(0);

        // now mint for each pool so withdraw can burn tokens
        const daiPoolMintAmount = await getMintAmount(daiPool, daiAmount);
        const usdcPoolMintAmount = await getMintAmount(usdcPool, usdcAmount);
        const usdtPoolMintAmount = await getMintAmount(usdtPool, usdtAmount);
        await mApt
          .connect(managerSigner)
          .mint(daiPool.address, daiPoolMintAmount);
        await mApt
          .connect(managerSigner)
          .mint(usdcPool.address, usdcPoolMintAmount);
        await mApt
          .connect(managerSigner)
          .mint(usdtPool.address, usdtPoolMintAmount);

        // transfer stablecoin to each pool to be able to withdraw
        await daiToken
          .connect(deployer)
          .transfer(fundedAccountAddress, daiAmount);
        await usdcToken
          .connect(deployer)
          .transfer(fundedAccountAddress, usdcAmount);
        await usdtToken
          .connect(deployer)
          .transfer(fundedAccountAddress, usdtAmount);
        // also adjust the TVL appropriately, as there is no Chainlink to update it
        const daiValue = await daiPool.getValueFromUnderlyerAmount(daiAmount);
        const usdcValue = await usdcPool.getValueFromUnderlyerAmount(
          usdcAmount
        );
        const usdtValue = await usdtPool.getValueFromUnderlyerAmount(
          usdtAmount
        );
        const newTvl = tvl.add(daiValue).add(usdcValue).add(usdtValue);
        await oracleAdapter.setLock(10);
        await oracleAdapter.setTvl(newTvl, 100);
        await oracleAdapter.setLock(0);

        const daiWithdrawAmount = daiAmount.div(2);
        const daiPoolBurnAmount = await getMintAmount(
          daiPool,
          daiWithdrawAmount
        );
        const usdcWithdrawAmount = usdcAmount.div(5);
        const usdcPoolBurnAmount = await getMintAmount(
          usdcPool,
          usdcWithdrawAmount
        );
        const usdtWithdrawAmount = usdtAmount;
        const usdtPoolBurnAmount = await getMintAmount(
          usdtPool,
          usdtWithdrawAmount
        );

        await poolManager.withdrawFromLpSafe([
          { poolId: bytes32("daiPool"), amount: daiWithdrawAmount },
          {
            poolId: bytes32("usdcPool"),
            amount: usdcWithdrawAmount,
          },
          {
            poolId: bytes32("usdtPool"),
            amount: usdtWithdrawAmount,
          },
        ]);

        const allowedDeviation = 2;

        let expectedBalance = daiPoolMintAmount.sub(daiPoolBurnAmount);
        let balance = await mApt.balanceOf(daiPool.address);
        expect(balance.sub(expectedBalance).abs()).lt(allowedDeviation);

        expectedBalance = usdcPoolMintAmount.sub(usdcPoolBurnAmount);
        balance = await mApt.balanceOf(usdcPool.address);
        expect(balance.sub(expectedBalance).abs()).lt(allowedDeviation);

        expectedBalance = usdtPoolMintAmount.sub(usdtPoolBurnAmount);
        balance = await mApt.balanceOf(usdtPool.address);
        expect(balance.sub(expectedBalance).abs()).lt(allowedDeviation);
      });
    });
  });
});
