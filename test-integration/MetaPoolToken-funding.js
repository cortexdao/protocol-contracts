const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const _ = require("lodash");
const {
  tokenAmountToBigNumber,
  bytes32,
  acquireToken,
  getStablecoinAddress,
  getAggregatorAddress,
} = require("../utils/helpers");
const { WHALE_POOLS } = require("../utils/constants");

const IDetailedERC20 = artifacts.require("IDetailedERC20");

/****************************/
/* set DEBUG log level here */
/****************************/
console.debugging = false;
/****************************/

const NETWORK = "MAINNET";
const SYMBOLS = ["DAI", "USDC", "USDT"];

const UNDERLYER_PARAMS = SYMBOLS.map((symbol) => {
  return {
    symbol: symbol,
    tokenAddress: getStablecoinAddress(symbol, NETWORK),
    aggAddress: getAggregatorAddress(`${symbol}-USD`, NETWORK),
  };
});

const DAI_TOKEN = getStablecoinAddress("DAI", NETWORK);
const USDC_TOKEN = getStablecoinAddress("USDC", NETWORK);
const USDT_TOKEN = getStablecoinAddress("USDT", NETWORK);

const daiPoolId = bytes32("daiPool");
const usdcPoolId = bytes32("usdcPool");
const tetherPoolId = bytes32("usdtPool");

describe.only("Contract: MetaPoolToken - funding and withdrawing", () => {
  // to-be-deployed contracts
  let tvlManager;
  let mApt;
  let oracleAdapter;

  // signers
  let deployer;
  let lpAccount;
  let emergencySafe;
  let adminSafe;
  let lpSafe;
  let randomUser;

  // existing Mainnet contracts
  let addressRegistry;

  let daiPool;
  let usdcPool;
  let usdtPool;

  let daiToken;
  let usdcToken;
  let usdtToken;

  // use EVM snapshots for test isolation
  let testSnapshotId;
  let suiteSnapshotId;
  let subSuiteSnapshotId;

  // standard amounts we use in our tests
  const dollars = 100;
  const daiAmount = tokenAmountToBigNumber(dollars, 18);
  const usdcAmount = tokenAmountToBigNumber(dollars, 6);
  const usdtAmount = tokenAmountToBigNumber(dollars, 6);

  before(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    suiteSnapshotId = snapshot["result"];
  });

  after(async () => {
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    testSnapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(testSnapshotId);
  });

  before("Main deployments and upgrades", async () => {
    [
      deployer,
      emergencySafe,
      adminSafe,
      lpSafe,
      randomUser,
    ] = await ethers.getSigners();

    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");

    /************************************************/
    /***** Deploy and upgrade Address Registry ******/
    /************************************************/
    const AddressRegistry = await ethers.getContractFactory("AddressRegistry");
    const addressRegistryLogic = await AddressRegistry.deploy();
    const AddressRegistryV2 = await ethers.getContractFactory(
      "AddressRegistryV2"
    );
    const addressRegistryLogicV2 = await AddressRegistryV2.deploy();
    const addressRegistryAdmin = await ProxyAdmin.deploy();

    const ProxyConstructorArg = await ethers.getContractFactory(
      "ProxyConstructorArg"
    );
    const encodedArg = await (await ProxyConstructorArg.deploy()).getEncodedArg(
      addressRegistryAdmin.address
    );
    const TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    const addressRegistryProxy = await TransparentUpgradeableProxy.deploy(
      addressRegistryLogic.address,
      addressRegistryAdmin.address,
      encodedArg
    );

    await addressRegistryAdmin.upgrade(
      addressRegistryProxy.address,
      addressRegistryLogicV2.address
    );

    addressRegistry = await AddressRegistryV2.attach(
      addressRegistryProxy.address
    );
    /* The address registry needs multiple addresses registered
     * to setup the roles for access control in the contract
     * constructors:
     *
     * MetaPoolToken
     * - emergencySafe (emergency role, default admin role)
     * - lpSafe (LP role)
     *
     * PoolTokenV2
     * - emergencySafe (emergency role, default admin role)
     * - adminSafe (admin role)
     * - mApt (contract role)
     *
     * Erc20Allocation
     * - emergencySafe (default admin role)
     * - lpSafe (LP role)
     * - mApt (contract role)
     *
     * TvlManager
     * - emergencySafe (emergency role, default admin role)
     * - lpSafe (LP role)
     *
     * OracleAdapter
     * - emergencySafe (emergency role, default admin role)
     * - adminSafe (admin role)
     * - tvlManager (contract role)
     * - mApt (contract role)
     *
     * Note the order of dependencies: a contract requires contracts
     * above it in the list to be deployed first.   Thus we need
     * to deploy in the order given, starting with the Safes.
     */
    await addressRegistry.registerAddress(
      bytes32("emergencySafe"),
      emergencySafe.address
    );
    await addressRegistry.registerAddress(
      bytes32("adminSafe"),
      adminSafe.address
    );
    await addressRegistry.registerAddress(bytes32("lpSafe"), lpSafe.address);

    /***********************/
    /***** deploy mAPT *****/
    /***********************/
    const MetaPoolToken = await ethers.getContractFactory("TestMetaPoolToken");
    const mAptLogic = await MetaPoolToken.deploy();

    const mAptAdmin = await ProxyAdmin.deploy();

    const MetaPoolTokenProxy = await ethers.getContractFactory(
      "MetaPoolTokenProxy"
    );
    const mAptProxy = await MetaPoolTokenProxy.deploy(
      mAptLogic.address,
      mAptAdmin.address,
      addressRegistry.address
    );

    mApt = await MetaPoolToken.attach(mAptProxy.address).connect(lpSafe);
    await addressRegistry.registerAddress(bytes32("mApt"), mApt.address);

    /*****************************/
    /***** deploy LP Account *****/
    /*****************************/
    const LpAccount = await ethers.getContractFactory("LpAccount");
    const lpAccountLogic = await LpAccount.deploy();

    const lpAccountAdmin = await ProxyAdmin.deploy();

    const initData = LpAccount.interface.encodeFunctionData(
      "initialize(address,address)",
      [lpAccountAdmin.address, addressRegistry.address]
    );

    const lpAccountProxy = await TransparentUpgradeableProxy.deploy(
      lpAccountLogic.address,
      lpAccountAdmin.address,
      initData
    );

    lpAccount = await LpAccount.attach(lpAccountProxy.address);
    await addressRegistry.registerAddress(
      bytes32("lpAccount"),
      lpAccount.address
    );

    /***********************************/
    /* deploy pools and upgrade to V2 */
    /***********************************/
    const PoolToken = await ethers.getContractFactory("PoolToken");
    const poolLogic = await PoolToken.deploy();

    const PoolTokenV2 = await ethers.getContractFactory("PoolTokenV2");
    const poolLogicV2 = await PoolTokenV2.deploy();

    const poolAdmin = await ProxyAdmin.deploy();
    const PoolTokenProxy = await ethers.getContractFactory("PoolTokenProxy");

    const pools = {};
    for (const { symbol, tokenAddress, aggAddress } of UNDERLYER_PARAMS) {
      const poolProxy = await PoolTokenProxy.deploy(
        poolLogic.address,
        poolAdmin.address,
        tokenAddress,
        aggAddress
      );

      const initData = PoolTokenV2.interface.encodeFunctionData(
        "initializeUpgrade(address)",
        [addressRegistry.address]
      );
      await poolAdmin.upgradeAndCall(
        poolProxy.address,
        poolLogicV2.address,
        initData
      );
      const pool = await PoolTokenV2.attach(poolProxy.address);

      const poolId = bytes32(symbol.toLowerCase() + "Pool");
      await addressRegistry.registerAddress(poolId, pool.address);

      pools[symbol.toLowerCase()] = pool;
    }
    daiPool = pools.dai;
    usdcPool = pools.usdc;
    usdtPool = pools.usdt;

    /******************************/
    /***** deploy TVL Manager *****/
    /******************************/
    const Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    const erc20Allocation = await Erc20Allocation.deploy(
      addressRegistry.address
    );
    const TvlManager = await ethers.getContractFactory("TestTvlManager");
    tvlManager = await TvlManager.deploy(addressRegistry.address);

    await addressRegistry.registerAddress(
      bytes32("tvlManager"),
      tvlManager.address
    );

    /*********************************/
    /***** deploy Oracle Adapter *****/
    /*********************************/

    const tvlAggAddress = getAggregatorAddress("TVL", NETWORK);
    const assetAddresses = UNDERLYER_PARAMS.map((_) => _.tokenAddress);
    const sourceAddresses = UNDERLYER_PARAMS.map((_) => _.aggAddress);

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
    await oracleAdapter.connect(emergencySafe).emergencySetTvl(0, 100);

    // registering ERC20 allocation must happen now, since the
    // TVL Manager will attempt to lock the Oracle Adapter.
    await tvlManager
      .connect(adminSafe)
      .registerAssetAllocation(erc20Allocation.address);
    await oracleAdapter.connect(emergencySafe).emergencyUnlock();
  });

  before("Fund accounts with stables", async () => {
    daiToken = await ethers.getContractAt("IDetailedERC20", DAI_TOKEN);
    usdcToken = await ethers.getContractAt("IDetailedERC20", USDC_TOKEN);
    usdtToken = await ethers.getContractAt("IDetailedERC20", USDT_TOKEN);
    // fund deployer with stablecoins
    await acquireToken(
      WHALE_POOLS["DAI"],
      deployer,
      daiToken,
      "1000000",
      deployer
    );
    await acquireToken(
      WHALE_POOLS["USDC"],
      deployer,
      usdcToken,
      "1000000",
      deployer
    );
    await acquireToken(
      WHALE_POOLS["USDT"],
      deployer,
      usdtToken,
      "1000000",
      deployer
    );
  });

  async function getMintAmount(pool, underlyerAmount) {
    const tokenPrice = await pool.getUnderlyerPrice();
    const underlyer = await pool.underlyer();
    const erc20 = await ethers.getContractAt(IDetailedERC20.abi, underlyer);
    const decimals = await erc20.decimals();
    const mintAmount = await mApt.testCalculateDelta(
      underlyerAmount,
      tokenPrice,
      decimals
    );
    return mintAmount;
  }

  describe("Permissions and input validation", () => {
    before(async () => {
      const snapshot = await timeMachine.takeSnapshot();
      subSuiteSnapshotId = snapshot["result"];
    });

    after(async () => {
      await timeMachine.revertToSnapshot(subSuiteSnapshotId);
    });

    describe("fundLpAccount", () => {
      it("Unpermissioned cannot call", async () => {
        await expect(
          mApt.connect(randomUser).fundLpAccount([])
        ).to.be.revertedWith("NOT_LP_ROLE");
      });

      it("LP role can call", async () => {
        await expect(mApt.connect(lpSafe).fundLpAccount([])).to.not.be.reverted;
      });

      it("Revert on unregistered pool", async () => {
        await expect(
          mApt
            .connect(lpSafe)
            .fundLpAccount([daiPoolId, bytes32("invalidPool"), tetherPoolId])
        ).to.be.revertedWith("Missing address");
      });
    });

    describe("withdrawFromLpAccount", () => {
      it("Unpermissioned cannot call", async () => {
        await expect(
          mApt.connect(randomUser).withdrawFromLpAccount([])
        ).to.be.revertedWith("NOT_LP_ROLE");
      });

      it("LP role can call", async () => {
        await expect(mApt.connect(lpSafe).withdrawFromLpAccount([])).to.not.be
          .reverted;
      });

      it("Revert on unregistered pool", async () => {
        await expect(
          mApt
            .connect(lpSafe)
            .withdrawFromLpAccount([
              daiPoolId,
              bytes32("invalidPool"),
              tetherPoolId,
            ])
        ).to.be.revertedWith("Missing address");
      });
    });

    describe("emergencyFundLpAccount", () => {
      it("Unpermissioned cannot call", async () => {
        await expect(
          mApt.connect(randomUser).emergencyFundLpAccount([], [])
        ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
      });

      it("Emergency role can call", async () => {
        await expect(mApt.connect(emergencySafe).emergencyFundLpAccount([], []))
          .to.not.be.reverted;
      });
    });

    describe("emergencyWithdrawFromLpAccount", () => {
      it("Unpermissioned cannot call", async () => {
        await expect(
          mApt.connect(randomUser).emergencyWithdrawFromLpAccount([], [])
        ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
      });

      it("Emergency role can call", async () => {
        await expect(
          mApt.connect(emergencySafe).emergencyWithdrawFromLpAccount([], [])
        ).to.not.be.reverted;
      });
    });
  });

  describe("Balances and minting", () => {
    before(async () => {
      const snapshot = await timeMachine.takeSnapshot();
      subSuiteSnapshotId = snapshot["result"];
    });

    after(async () => {
      await timeMachine.revertToSnapshot(subSuiteSnapshotId);
    });

    before("Fund pools with stables", async () => {
      // fund each APY pool with corresponding stablecoin
      await acquireToken(
        WHALE_POOLS["DAI"],
        daiPool,
        daiToken,
        "5000000",
        deployer
      );
      await acquireToken(
        WHALE_POOLS["USDC"],
        usdcPool,
        usdcToken,
        "5000000",
        deployer
      );
      await acquireToken(
        WHALE_POOLS["USDT"],
        usdtPool,
        usdtToken,
        "5000000",
        deployer
      );
    });

    describe("_fundLpAccount", () => {
      it("Revert on missing LP Safe address", async () => {
        await addressRegistry.deleteAddress(bytes32("lpAccount"));
        await expect(mApt.testFundLpAccount([], [])).to.be.revertedWith(
          "Missing address"
        );
      });

      it("Skip on zero amount", async () => {
        const mAptSupply = await mApt.totalSupply();
        const poolBalance = await usdcToken.balanceOf(usdcPool.address);

        await mApt.testFundLpAccount([usdcPool.address], [0]);

        // should be no mAPT minted and no change in pool's USDC balance
        expect(await mApt.totalSupply()).to.equal(mAptSupply);
        expect(await usdcToken.balanceOf(usdcPool.address)).to.equal(
          poolBalance
        );
      });

      it("First funding updates balances and registers asset allocations (single pool)", async () => {
        // pre-conditions
        expect(await daiToken.balanceOf(lpAccount.address)).to.equal(0);
        expect(await mApt.totalSupply()).to.equal(0);

        /***********************************************/
        /* Test all balances are updated appropriately */
        /***********************************************/
        const daiPoolBalance = await daiToken.balanceOf(daiPool.address);

        const daiPoolMintAmount = await getMintAmount(daiPool, daiAmount);

        await mApt.testFundLpAccount([daiPool.address], [daiAmount]);

        const strategyDaiBalance = await daiToken.balanceOf(lpAccount.address);

        // Check underlyer amounts transferred correctly
        expect(strategyDaiBalance).to.equal(daiAmount);

        expect(await daiToken.balanceOf(daiPool.address)).to.equal(
          daiPoolBalance.sub(daiAmount)
        );

        // Check proper mAPT amounts minted
        expect(await mApt.balanceOf(daiPool.address)).to.equal(
          daiPoolMintAmount
        );

        /*************************************************************/
        /* Check pool manager registered asset allocations correctly */
        /*************************************************************/

        const erc20AllocationAddress = await tvlManager.getAssetAllocation(
          "erc20Allocation"
        );
        const expectedDaiId = await tvlManager.testEncodeAssetAllocationId(
          erc20AllocationAddress,
          0
        );
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
        expect(await daiToken.balanceOf(lpAccount.address)).to.equal(0);
        expect(await usdcToken.balanceOf(lpAccount.address)).to.equal(0);
        expect(await usdtToken.balanceOf(lpAccount.address)).to.equal(0);
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

        await mApt.testFundLpAccount(
          [daiPool.address, usdcPool.address, usdtPool.address],
          [daiAmount, usdcAmount, usdtAmount]
        );

        const strategyDaiBalance = await daiToken.balanceOf(lpAccount.address);
        const strategyUsdcBalance = await usdcToken.balanceOf(
          lpAccount.address
        );
        const strategyUsdtBalance = await usdtToken.balanceOf(
          lpAccount.address
        );

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
        expect(await mApt.balanceOf(daiPool.address)).to.equal(
          daiPoolMintAmount
        );
        expect(await mApt.balanceOf(usdcPool.address)).to.equal(
          usdcPoolMintAmount
        );
        expect(await mApt.balanceOf(usdtPool.address)).to.equal(
          usdtPoolMintAmount
        );

        /*************************************************************/
        /* Check pool manager registered asset allocations correctly */
        /*************************************************************/

        const erc20AllocationAddress = await tvlManager.getAssetAllocation(
          "erc20Allocation"
        );
        const expectedDaiId = await tvlManager.testEncodeAssetAllocationId(
          erc20AllocationAddress,
          0
        );
        const expectedUsdcId = await tvlManager.testEncodeAssetAllocationId(
          erc20AllocationAddress,
          1
        );
        const expectedUsdtId = await tvlManager.testEncodeAssetAllocationId(
          erc20AllocationAddress,
          2
        );
        const registeredIds = await tvlManager.getAssetAllocationIds();
        expect(registeredIds.length).to.equal(3);
        expect(registeredIds[0]).to.equal(expectedDaiId);
        expect(registeredIds[1]).to.equal(expectedUsdcId);
        expect(registeredIds[2]).to.equal(expectedUsdtId);

        const registeredDaiSymbol = await tvlManager.symbolOf(registeredIds[0]);
        const registeredUsdcSymbol = await tvlManager.symbolOf(
          registeredIds[1]
        );
        const registeredUsdtSymbol = await tvlManager.symbolOf(
          registeredIds[2]
        );
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
        await mApt.testFundLpAccount([daiPool.address], [daiAmount]);
        expect(await daiToken.balanceOf(lpAccount.address)).to.be.gt(0);
        expect(await mApt.totalSupply()).to.be.gt(0);

        // adjust the TVL appropriately, as there is no Chainlink to update it
        await oracleAdapter.connect(emergencySafe).emergencyUnlock(); // needed to get value
        const tvl = await daiPool.getValueFromUnderlyerAmount(daiAmount);
        await oracleAdapter.connect(emergencySafe).emergencySetTvl(tvl, 100);

        /***********************************************/
        /* Test all balances are updated appropriately */
        /***********************************************/
        const prevPoolBalance = await daiToken.balanceOf(daiPool.address);
        const prevStrategyBalance = await daiToken.balanceOf(lpAccount.address);
        const prevMaptBalance = await mApt.balanceOf(daiPool.address);

        const transferAmount = daiAmount.mul(3);
        const mintAmount = await getMintAmount(daiPool, transferAmount);

        await mApt.testFundLpAccount([daiPool.address], [transferAmount]);

        const newPoolBalance = await daiToken.balanceOf(daiPool.address);
        const newStrategyBalance = await daiToken.balanceOf(lpAccount.address);
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
        await mApt.testFundLpAccount(
          [daiPool.address, usdcPool.address, usdtPool.address],
          [daiAmount, usdcAmount, usdtAmount]
        );
        expect(await daiToken.balanceOf(lpAccount.address)).to.be.gt(0);
        expect(await usdcToken.balanceOf(lpAccount.address)).to.be.gt(0);
        expect(await usdtToken.balanceOf(lpAccount.address)).to.be.gt(0);
        expect(await mApt.totalSupply()).to.be.gt(0);

        // adjust the TVL appropriately, as there is no Chainlink to update it
        await oracleAdapter.connect(emergencySafe).emergencyUnlock(); // needed to get value
        const daiValue = await daiPool.getValueFromUnderlyerAmount(daiAmount);
        const usdcValue = await usdcPool.getValueFromUnderlyerAmount(
          usdcAmount
        );
        const usdtValue = await usdtPool.getValueFromUnderlyerAmount(
          usdtAmount
        );
        const tvl = daiValue.add(usdcValue).add(usdtValue);
        await oracleAdapter.connect(emergencySafe).emergencySetTvl(tvl, 100);

        /***********************************************/
        /* Test all balances are updated appropriately */
        /***********************************************/
        // DAI
        const prevDaiPoolBalance = await daiToken.balanceOf(daiPool.address);
        const prevSafeDaiBalance = await daiToken.balanceOf(lpAccount.address);
        const prevDaiPoolMaptBalance = await mApt.balanceOf(daiPool.address);
        // USDC
        const prevUsdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
        const prevSafeUsdcBalance = await usdcToken.balanceOf(
          lpAccount.address
        );
        const prevUsdcPoolMaptBalance = await mApt.balanceOf(usdcPool.address);
        // Tether
        const prevUsdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);
        const prevSafeUsdtBalance = await usdtToken.balanceOf(
          lpAccount.address
        );
        const prevUsdtPoolMaptBalance = await mApt.balanceOf(usdtPool.address);

        const daiTransferAmount = daiAmount.mul(3);
        const usdcTransferAmount = usdcAmount.mul(2).div(3);
        const usdtTransferAmount = usdtAmount.div(2);

        const daiPoolMintAmount = await getMintAmount(
          daiPool,
          daiTransferAmount
        );
        const usdcPoolMintAmount = await getMintAmount(
          usdcPool,
          usdcTransferAmount
        );
        const usdtPoolMintAmount = await getMintAmount(
          usdtPool,
          usdtTransferAmount
        );

        await mApt.testFundLpAccount(
          [daiPool.address, usdcPool.address, usdtPool.address],
          [daiTransferAmount, usdcTransferAmount, usdtTransferAmount]
        );

        const newDaiPoolBalance = await daiToken.balanceOf(daiPool.address);
        const newSafeDaiBalance = await daiToken.balanceOf(lpAccount.address);
        const newDaiPoolMaptBalance = await mApt.balanceOf(daiPool.address);

        const newUsdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
        const newSafeUsdcBalance = await usdcToken.balanceOf(lpAccount.address);
        const newUsdcPoolMaptBalance = await mApt.balanceOf(usdcPool.address);

        const newUsdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);
        const newSafeUsdtBalance = await usdtToken.balanceOf(lpAccount.address);
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

    describe("_withdrawFromLpAccount", () => {
      it("Withdrawal updates balances correctly (single pool)", async () => {
        const transferAmount = tokenAmountToBigNumber("10", 18);
        await mApt.testFundLpAccount([daiPool.address], [transferAmount]);

        // adjust the TVL appropriately, as there is no Chainlink to update it
        await oracleAdapter.connect(emergencySafe).emergencyUnlock(); // needed to get value
        const tvl = await daiPool.getValueFromUnderlyerAmount(transferAmount);
        await oracleAdapter.connect(emergencySafe).emergencySetTvl(tvl, 100);

        const prevSafeBalance = await daiToken.balanceOf(lpAccount.address);
        const prevPoolBalance = await daiToken.balanceOf(daiPool.address);
        const prevMaptBalance = await mApt.balanceOf(daiPool.address);

        const burnAmount = await getMintAmount(daiPool, transferAmount);

        await mApt.testWithdrawFromLpAccount(
          [daiPool.address],
          [transferAmount]
        );

        const newSafeBalance = await daiToken.balanceOf(lpAccount.address);
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

      it("Withdrawal updates balances correctly (multiple pools)", async () => {
        const daiTransferAmount = tokenAmountToBigNumber("10", 18);
        const usdcTransferAmount = tokenAmountToBigNumber("25", 6);
        const usdtTransferAmount = tokenAmountToBigNumber("8", 6);
        await mApt.testFundLpAccount(
          [daiPool.address, usdcPool.address, usdtPool.address],
          [daiTransferAmount, usdcTransferAmount, usdtTransferAmount]
        );

        // adjust the TVL appropriately, as there is no Chainlink to update it
        await oracleAdapter.connect(emergencySafe).emergencyUnlock(); // needed to get value
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
        await oracleAdapter.connect(emergencySafe).emergencySetTvl(tvl, 100);

        // DAI
        const prevSafeDaiBalance = await daiToken.balanceOf(lpAccount.address);
        const prevDaiPoolBalance = await daiToken.balanceOf(daiPool.address);
        const prevDaiMaptBalance = await mApt.balanceOf(daiPool.address);
        // USDC
        const prevSafeUsdcBalance = await usdcToken.balanceOf(
          lpAccount.address
        );
        const prevUsdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
        const prevUsdcMaptBalance = await mApt.balanceOf(usdcPool.address);
        // USDT
        const prevSafeUsdtBalance = await usdtToken.balanceOf(
          lpAccount.address
        );
        const prevUsdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);
        const prevUsdtMaptBalance = await mApt.balanceOf(usdtPool.address);

        const daiPoolBurnAmount = await getMintAmount(
          daiPool,
          daiTransferAmount
        );
        const usdcPoolBurnAmount = await getMintAmount(
          usdcPool,
          usdcTransferAmount
        );
        const usdtPoolBurnAmount = await getMintAmount(
          usdtPool,
          usdtTransferAmount
        );

        await mApt.testWithdrawFromLpAccount(
          [daiPool.address, usdcPool.address, usdtPool.address],
          [daiTransferAmount, usdcTransferAmount, usdtTransferAmount]
        );

        /****************************/
        /* check underlyer balances */
        /****************************/

        // DAI
        const newSafeDaiBalance = await daiToken.balanceOf(lpAccount.address);
        const newDaiPoolBalance = await daiToken.balanceOf(daiPool.address);
        expect(prevSafeDaiBalance.sub(newSafeDaiBalance)).to.equal(
          daiTransferAmount
        );
        expect(newDaiPoolBalance.sub(prevDaiPoolBalance)).to.equal(
          daiTransferAmount
        );
        // USDC
        const newSafeUsdcBalance = await usdcToken.balanceOf(lpAccount.address);
        const newUsdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
        expect(prevSafeUsdcBalance.sub(newSafeUsdcBalance)).to.equal(
          usdcTransferAmount
        );
        expect(newUsdcPoolBalance.sub(prevUsdcPoolBalance)).to.equal(
          usdcTransferAmount
        );
        // USDT
        const newSafeUsdtBalance = await daiToken.balanceOf(lpAccount.address);
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
        const expectedDaiMaptBalance = prevDaiMaptBalance.sub(
          daiPoolBurnAmount
        );
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

      it("Full withdrawal reverts if TVL not updated", async () => {
        let totalTransferred = tokenAmountToBigNumber(0, 18);
        let transferAmount = daiAmount.div(2);
        await mApt.testFundLpAccount([daiPool.address], [transferAmount]);
        totalTransferred = totalTransferred.add(transferAmount);

        // adjust the tvl appropriately, as there is no chainlink to update it
        await oracleAdapter.connect(emergencySafe).emergencyUnlock(); // needed to get value
        let tvl = await daiPool.getValueFromUnderlyerAmount(transferAmount);
        await oracleAdapter.connect(emergencySafe).emergencySetTvl(tvl, 100);

        transferAmount = daiAmount.div(3);
        await mApt.testFundLpAccount([daiPool.address], [transferAmount]);
        await oracleAdapter.connect(emergencySafe).emergencyUnlock();
        totalTransferred = totalTransferred.add(transferAmount);

        await expect(
          mApt.testWithdrawFromLpAccount([daiPool.address], [totalTransferred])
        ).to.be.revertedWith("ERC20: burn amount exceeds balance");
      });

      it("Full withdrawal works if TVL updated", async () => {
        expect(await mApt.balanceOf(daiPool.address)).to.equal(0);
        const poolBalance = await daiToken.balanceOf(daiPool.address);

        let totalTransferred = tokenAmountToBigNumber(0, 18);
        let transferAmount = daiAmount.div(2);
        await mApt.testFundLpAccount([daiPool.address], [transferAmount]);
        totalTransferred = totalTransferred.add(transferAmount);

        // adjust the tvl appropriately, as there is no chainlink to update it
        await oracleAdapter.connect(emergencySafe).emergencyUnlock(); // needed to get value
        let tvl = await daiPool.getValueFromUnderlyerAmount(totalTransferred);
        await oracleAdapter.connect(emergencySafe).emergencySetTvl(tvl, 100);

        transferAmount = daiAmount.div(3);
        await mApt.testFundLpAccount([daiPool.address], [transferAmount]);
        await oracleAdapter.connect(emergencySafe).emergencyUnlock();
        totalTransferred = totalTransferred.add(transferAmount);

        // adjust the tvl appropriately, as there is no chainlink to update it
        await oracleAdapter.connect(emergencySafe).emergencyUnlock(); // needed to get value
        tvl = await daiPool.getValueFromUnderlyerAmount(totalTransferred);
        await oracleAdapter.connect(emergencySafe).emergencySetTvl(tvl, 100);

        await mApt.testWithdrawFromLpAccount(
          [daiPool.address],
          [totalTransferred]
        );

        expect(await mApt.balanceOf(daiPool.address)).to.equal(0);
        expect(await daiToken.balanceOf(daiPool.address)).to.equal(poolBalance);
      });
    });
  });

  describe.only("Funding scenarios", () => {
    before(async () => {
      const snapshot = await timeMachine.takeSnapshot();
      subSuiteSnapshotId = snapshot["result"];
    });

    after(async () => {
      await timeMachine.revertToSnapshot(subSuiteSnapshotId);
    });

    describe("Initial funding of LP Account", () => {
      beforeEach("Deposit into pools", async () => {
        const pools = [daiPool, usdcPool, usdtPool];
        const underlyers = [daiToken, usdcToken, usdtToken];
        for (const [pool, underlyer] of _.zip(pools, underlyers)) {
          const depositAmount = tokenAmountToBigNumber(
            "105",
            await underlyer.decimals()
          );
          await underlyer.approve(pool.address, depositAmount);
          await pool.addLiquidity(depositAmount);

          expect(await underlyer.balanceOf(pool.address)).to.equal(
            depositAmount
          );
          expect(await underlyer.balanceOf(lpAccount.address)).to.be.zero;
        }
      });

      it("Remaining pool balance should be reserve percentage (one pool)", async () => {
        const oldPoolBalance = await usdcToken.balanceOf(usdcPool.address);

        await mApt.fundLpAccount([usdcPoolId]);

        const lpAccountBalance = await usdcToken.balanceOf(lpAccount.address);
        const newPoolBalance = await usdcToken.balanceOf(usdcPool.address);
        const reservePercentage = await usdcPool.reservePercentage();

        const expectedAmount = lpAccountBalance.mul(reservePercentage).div(100);
        expect(newPoolBalance).to.equal(expectedAmount);

        expect(newPoolBalance.add(lpAccountBalance)).to.equal(oldPoolBalance);
      });

      it("Remaining pool balance should be reserve percentage (multiple pools)", async () => {
        const oldDaiPoolBalance = await daiToken.balanceOf(daiPool.address);
        const oldUsdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
        const oldTetherPoolBalance = await usdtToken.balanceOf(
          usdtPool.address
        );

        await mApt.fundLpAccount([daiPoolId, usdcPoolId, tetherPoolId]);

        const newDaiPoolBalance = await daiToken.balanceOf(daiPool.address);
        const newUsdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
        const newTetherPoolBalance = await usdtToken.balanceOf(
          usdtPool.address
        );
        const reservePercentage = await usdcPool.reservePercentage();

        let expectedAmount = (await daiToken.balanceOf(lpAccount.address))
          .mul(reservePercentage)
          .div(100);
        expect(newDaiPoolBalance).to.equal(expectedAmount);

        expectedAmount = (await usdcToken.balanceOf(lpAccount.address))
          .mul(reservePercentage)
          .div(100);
        expect(newUsdcPoolBalance).to.equal(expectedAmount);

        expectedAmount = (await usdtToken.balanceOf(lpAccount.address))
          .mul(reservePercentage)
          .div(100);
        expect(newTetherPoolBalance).to.equal(expectedAmount);

        let totalBalance = (await daiToken.balanceOf(lpAccount.address)).add(
          newDaiPoolBalance
        );
        expect(totalBalance).to.equal(oldDaiPoolBalance);

        totalBalance = (await usdcToken.balanceOf(lpAccount.address)).add(
          newUsdcPoolBalance
        );
        expect(totalBalance).to.equal(oldUsdcPoolBalance);

        totalBalance = (await usdtToken.balanceOf(lpAccount.address)).add(
          newTetherPoolBalance
        );
        expect(totalBalance).to.equal(oldTetherPoolBalance);
      });
    });

    describe("Top-up pools", () => {
      before("", async () => {
        //
      });

      it("Should top-up pool to reserve percentage", async () => {
        //
      });
    });

    describe("Emergency withdraw from LP Account", () => {
      beforeEach("Seed LP Account with funds", async () => {
        const ids = [daiPoolId, usdcPoolId, tetherPoolId];
        const pools = [daiPool, usdcPool, usdtPool];
        const underlyers = [daiToken, usdcToken, usdtToken];
        for (const [id, pool, underlyer] of _.zip(ids, pools, underlyers)) {
          const depositAmount = tokenAmountToBigNumber(
            "105",
            await underlyer.decimals()
          );
          await underlyer.approve(pool.address, depositAmount);
          await pool.addLiquidity(depositAmount);

          await mApt.fundLpAccount([id]);
          expect(await underlyer.balanceOf(lpAccount.address)).to.be.gt(0);

          await oracleAdapter.connect(emergencySafe).emergencyUnlock();
        }
      });

      it("Should be able to fully withdraw (one pool)", async () => {
        const oldPoolBalance = await usdcToken.balanceOf(usdcPool.address);
        const lpAccountBalance = await usdcToken.balanceOf(lpAccount.address);

        await mApt
          .connect(emergencySafe)
          .emergencyWithdrawFromLpAccount(
            [usdcPool.address],
            [lpAccountBalance]
          );

        expect(await usdcToken.balanceOf(lpAccount.address)).to.be.zero;
        expect(await usdcToken.balanceOf(usdcPool.address)).to.equal(
          oldPoolBalance.add(lpAccountBalance)
        );
      });

      it("Should be able to fully withdraw (multiple pools)", async () => {
        //
      });

      it("Should be able to withdraw partial funds (one pool)", async () => {
        //
      });

      it("Should be able to withdraw partial funds (multiple pools)", async () => {
        //
      });
    });

    describe("Emergency funding of LP Account", () => {
      before("", async () => {
        //
      });

      it("Should be able to fund specified amount (one pool)", async () => {
        //
      });

      it("Should be able to fund specified amount (multiple pools)", async () => {
        //
      });
    });
  });
});
