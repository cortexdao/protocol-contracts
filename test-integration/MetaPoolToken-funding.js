const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");
const { BigNumber } = ethers;
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
const TOKEN_ADDRESSES = SYMBOLS.map((symbol) =>
  getStablecoinAddress(symbol, NETWORK)
);
const AGG_ADDRESSES = SYMBOLS.map((symbol) =>
  getAggregatorAddress(`${symbol}-USD`, NETWORK)
);

const DAI_TOKEN = TOKEN_ADDRESSES[0];
const USDC_TOKEN = TOKEN_ADDRESSES[1];
const USDT_TOKEN = TOKEN_ADDRESSES[2];

const daiPoolId = bytes32("daiPool");
const usdcPoolId = bytes32("usdcPool");
const tetherPoolId = bytes32("usdtPool");
const ids = [daiPoolId, usdcPoolId, tetherPoolId];

describe("Contract: MetaPoolToken - funding and withdrawing", () => {
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
  let pools;

  let daiToken;
  let usdcToken;
  let usdtToken;
  let underlyers;

  // use EVM snapshots for test isolation
  let suiteSnapshotId;

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

  before("Main deployments and upgrades", async () => {
    [deployer, emergencySafe, adminSafe, lpSafe, randomUser] =
      await ethers.getSigners();

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
    const encodedArg = await (
      await ProxyConstructorArg.deploy()
    ).getEncodedArg(addressRegistryAdmin.address);
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

    addressRegistry = AddressRegistryV2.attach(addressRegistryProxy.address);
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

    const initData = MetaPoolToken.interface.encodeFunctionData(
      "initialize(address)",
      [addressRegistry.address]
    );
    const mAptProxy = await TransparentUpgradeableProxy.deploy(
      mAptLogic.address,
      mAptAdmin.address,
      initData
    );

    mApt = MetaPoolToken.attach(mAptProxy.address).connect(lpSafe);
    await addressRegistry.registerAddress(bytes32("mApt"), mApt.address);

    /*****************************/
    /***** deploy LP Account *****/
    /*****************************/
    const LpAccount = await ethers.getContractFactory("LpAccount");
    const lpAccountLogic = await LpAccount.deploy();

    const lpAccountAdmin = await ProxyAdmin.deploy();

    const lpAccountInitData = LpAccount.interface.encodeFunctionData(
      "initialize(address)",
      [addressRegistry.address]
    );

    const lpAccountProxy = await TransparentUpgradeableProxy.deploy(
      lpAccountLogic.address,
      lpAccountAdmin.address,
      lpAccountInitData
    );

    lpAccount = LpAccount.attach(lpAccountProxy.address);
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

    const poolTokenV2InitData = PoolTokenV2.interface.encodeFunctionData(
      "initializeUpgrade(address)",
      [addressRegistry.address]
    );

    pools = [];
    for (const [symbol, tokenAddress, aggAddress] of _.zip(
      SYMBOLS,
      TOKEN_ADDRESSES,
      AGG_ADDRESSES
    )) {
      const poolProxy = await PoolTokenProxy.deploy(
        poolLogic.address,
        poolAdmin.address,
        tokenAddress,
        aggAddress
      );

      await poolAdmin.upgradeAndCall(
        poolProxy.address,
        poolLogicV2.address,
        poolTokenV2InitData
      );
      const pool = PoolTokenV2.attach(poolProxy.address);

      const poolId = bytes32(symbol.toLowerCase() + "Pool");
      await addressRegistry.registerAddress(poolId, pool.address);

      pools.push(pool);
    }
    daiPool = pools[0];
    usdcPool = pools[1];
    usdtPool = pools[2];

    /******************************/
    /***** deploy TVL Manager *****/
    /******************************/
    const Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    const erc20Allocation = await Erc20Allocation.deploy(
      addressRegistry.address
    );
    await addressRegistry.registerAddress(
      bytes32("erc20Allocation"),
      erc20Allocation.address
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

    const OracleAdapter = await ethers.getContractFactory("OracleAdapter");
    oracleAdapter = await OracleAdapter.deploy(
      addressRegistry.address,
      tvlAggAddress,
      TOKEN_ADDRESSES,
      AGG_ADDRESSES,
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

  before("Attach to Mainnet stablecoin contracts", async () => {
    daiToken = await ethers.getContractAt("IDetailedERC20", DAI_TOKEN);
    usdcToken = await ethers.getContractAt("IDetailedERC20", USDC_TOKEN);
    usdtToken = await ethers.getContractAt("IDetailedERC20", USDT_TOKEN);
    underlyers = [daiToken, usdcToken, usdtToken];
  });

  before("Fund accounts with stables", async () => {
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
    let subSuiteSnapshotId;
    let testSnapshotId;

    beforeEach(async () => {
      const snapshot = await timeMachine.takeSnapshot();
      testSnapshotId = snapshot["result"];
    });

    afterEach(async () => {
      await timeMachine.revertToSnapshot(testSnapshotId);
    });

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
  });

  describe("Balances and minting", () => {
    let subSuiteSnapshotId;
    let testSnapshotId;

    beforeEach(async () => {
      const snapshot = await timeMachine.takeSnapshot();
      testSnapshotId = snapshot["result"];
    });

    afterEach(async () => {
      await timeMachine.revertToSnapshot(testSnapshotId);
    });

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
      it("Withdrawing zero amount skips burn and transfer", async () => {
        // pre-conditions
        expect(await daiToken.balanceOf(lpAccount.address)).to.equal(0);
        expect(await mApt.totalSupply()).to.equal(0);

        const zeroAmount = tokenAmountToBigNumber(0, 18);
        await expect(
          mApt.testWithdrawFromLpAccount([daiPool.address], [zeroAmount])
        ).to.not.emit(mApt, "Burn");

        await oracleAdapter.connect(emergencySafe).emergencyUnlock();

        // test zero withdrawal again but with mAPT supply and other values non-zero
        const transferAmount = tokenAmountToBigNumber("10", 18);
        await mApt.testFundLpAccount([daiPool.address], [transferAmount]);

        // adjust the TVL appropriately, as there is no Chainlink to update it
        await oracleAdapter.connect(emergencySafe).emergencyUnlock(); // needed to get value
        const tvl = await daiPool.getValueFromUnderlyerAmount(transferAmount);
        await oracleAdapter.connect(emergencySafe).emergencySetTvl(tvl, 100);

        await expect(
          mApt.testWithdrawFromLpAccount(
            [daiPool.address],
            [tokenAmountToBigNumber(0, 18)]
          )
        ).to.not.emit(mApt, "Burn");
      });

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
        const expectedDaiMaptBalance =
          prevDaiMaptBalance.sub(daiPoolBurnAmount);
        expect(newDaiMaptBalance.sub(expectedDaiMaptBalance).abs()).lt(
          allowedDeviation
        );
        // USDC
        const newUsdcMaptBalance = await mApt.balanceOf(usdcPool.address);
        const expectedUsdcMaptBalance =
          prevUsdcMaptBalance.sub(usdcPoolBurnAmount);
        expect(newUsdcMaptBalance.sub(expectedUsdcMaptBalance).abs()).lt(
          allowedDeviation
        );
        // USDT
        const newUsdtMaptBalance = await mApt.balanceOf(usdtPool.address);
        const expectedUsdtMaptBalance =
          prevUsdtMaptBalance.sub(usdtPoolBurnAmount);
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

  describe("Funding scenarios", () => {
    // CAUTION: some of the scenarios here rely on the "it" steps
    // proceeding in sequence, using previous state.
    //
    // So we only revert to snapshot at the this level and leave
    // it up to each "describe" below to revert or not at the
    // individual test level.
    let subSuiteSnapshotId;

    before(async () => {
      const snapshot = await timeMachine.takeSnapshot();
      subSuiteSnapshotId = snapshot["result"];
    });

    after(async () => {
      await timeMachine.revertToSnapshot(subSuiteSnapshotId);
    });

    /*
     * @param pool
     * @param underlyerAmount amount being transferred to LP Account.
     * Uses the same sign convention as `pool.getReserveTopUpValue`.
     */
    async function updateTvlAfterTransfer(pool, underlyerAmount) {
      underlyerAmount = underlyerAmount.mul(-1);
      await oracleAdapter.connect(emergencySafe).emergencyUnlock();

      const underlyerPrice = await pool.getUnderlyerPrice();
      const underlyerAddress = await pool.underlyer();

      const underlyer = await ethers.getContractAt(
        "IDetailedERC20",
        underlyerAddress
      );
      const decimals = await underlyer.decimals();

      const underlyerUsdValue = convertToUsdValue(
        underlyerAmount,
        underlyerPrice,
        decimals
      );

      await updateTvl(underlyerUsdValue);
    }

    function convertToUsdValue(tokenWeiAmount, tokenUsdPrice, decimals) {
      return tokenWeiAmount
        .mul(tokenUsdPrice)
        .div(BigNumber.from(10).pow(decimals));
    }

    async function updateTvl(usdValue) {
      const newTvl = (await oracleAdapter.getTvl()).add(usdValue);
      await oracleAdapter.connect(emergencySafe).emergencySetTvl(newTvl, 50);
    }

    describe("Initial funding of LP Account", () => {
      let testSnapshotId;

      beforeEach(async () => {
        const snapshot = await timeMachine.takeSnapshot();
        testSnapshotId = snapshot["result"];
      });

      afterEach(async () => {
        await timeMachine.revertToSnapshot(testSnapshotId);
      });

      beforeEach("Deposit into pools", async () => {
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
      let snapshotId;

      const deployedTokens = 15000;
      let depositTokens;

      let reservePercentage;
      let feePercentage;
      // convenient to use this than always changing the
      // percentage redeemed
      const redeemPercentage = BigNumber.from(1);

      before(async () => {
        const snapshot = await timeMachine.takeSnapshot();
        snapshotId = snapshot["result"];
      });

      after(async () => {
        await timeMachine.revertToSnapshot(snapshotId);
      });

      async function setTvlToLpAccountValue() {
        await oracleAdapter.connect(emergencySafe).emergencyUnlock();

        const startLpDaiBalance = await daiToken.balanceOf(lpAccount.address);
        const daiUsdValue = await daiPool.getValueFromUnderlyerAmount(
          startLpDaiBalance
        );
        const startLpUsdcBalance = await usdcToken.balanceOf(lpAccount.address);
        const usdcUsdValue = await usdcPool.getValueFromUnderlyerAmount(
          startLpUsdcBalance
        );
        const startLpUsdtBalance = await usdtToken.balanceOf(lpAccount.address);
        const usdtUsdValue = await usdtPool.getValueFromUnderlyerAmount(
          startLpUsdtBalance
        );
        const totalUsdValue = daiUsdValue.add(usdcUsdValue).add(usdtUsdValue);
        await oracleAdapter
          .connect(emergencySafe)
          .emergencySetTvl(totalUsdValue, 50);
      }

      it("Seed LP Account with funds", async () => {
        for (const [id, pool, underlyer] of _.zip(ids, pools, underlyers)) {
          // FIXME: the test setup assumes each pool will have the same
          // fee and reserve percentages
          feePercentage = await pool.feePercentage();
          reservePercentage = await pool.reservePercentage();

          depositTokens = reservePercentage
            .add(100)
            .mul(deployedTokens)
            .div(100)
            .toString();

          const decimals = await underlyer.decimals();
          const depositAmount = tokenAmountToBigNumber(depositTokens, decimals);
          await underlyer.approve(pool.address, depositAmount);
          await pool.addLiquidity(depositAmount);

          await mApt.fundLpAccount([id]);

          const deployedAmount = tokenAmountToBigNumber(
            deployedTokens,
            decimals
          );
          expect(await underlyer.balanceOf(lpAccount.address)).to.equal(
            deployedAmount
          );

          await updateTvlAfterTransfer(pool, deployedAmount.mul(-1));
        }
      });

      it("Can redeem less than reserve amount after funding LP Account", async () => {
        const aptBalance = await usdcPool.balanceOf(deployer.address);
        const poolBalance = await usdcToken.balanceOf(usdcPool.address);
        const redeemAmount = aptBalance.mul(redeemPercentage).div(100);
        await expect(usdcPool.redeem(redeemAmount)).to.not.reverted;

        const newPoolBalance = await usdcToken.balanceOf(usdcPool.address);
        const expectedWithdrawalAmount = tokenAmountToBigNumber(
          depositTokens,
          6
        )
          .mul(redeemAmount)
          .div(aptBalance);
        const expectedWithdrawalAmountAfterFee = expectedWithdrawalAmount
          .mul(BigNumber.from(100).sub(feePercentage))
          .div(100);
        const poolBalanceDelta = poolBalance.sub(newPoolBalance);
        expect(poolBalanceDelta).to.equal(expectedWithdrawalAmountAfterFee);
      });

      it("Should top-up pool to reserve percentage", async () => {
        const transferAmount = await usdcPool.getReserveTopUpValue();

        await expect(mApt.withdrawFromLpAccount([usdcPoolId])).to.not.be
          .reverted;

        await updateTvlAfterTransfer(usdcPool, transferAmount);

        const lpAccountBalance = await usdcToken.balanceOf(lpAccount.address);
        const expectedBalance = lpAccountBalance
          .mul(reservePercentage)
          .div(100);

        const poolBalance = await usdcToken.balanceOf(usdcPool.address);
        expect(poolBalance).to.equal(expectedBalance);
      });

      it("Can't redeem more than available reserve", async () => {
        const aptBalance = await usdcPool.balanceOf(deployer.address);
        const unredeemableAptAmount = aptBalance
          .mul(reservePercentage.add(1))
          .div(100);
        await expect(usdcPool.redeem(unredeemableAptAmount)).to.be.reverted;
      });

      it("Can add liquidity and redeem after top-up", async () => {
        const decimals = await usdcToken.decimals();
        const depositAmount = tokenAmountToBigNumber("1500", decimals);

        const prevAptBalance = await usdcPool.balanceOf(deployer.address);

        await usdcToken.approve(usdcPool.address, depositAmount);
        await usdcPool.addLiquidity(depositAmount);

        const newAptBalance = await usdcPool.balanceOf(deployer.address);

        // In [1]: ((15000 * 1.05) * 0.99) / ((15000 * 1.05) * 0.99 + 1500)
        // Out[1]: 0.9122422114962703
        expect(prevAptBalance.mul(100).div(newAptBalance)).to.equal(91);

        const prevUnderlyerBalance = await usdcToken.balanceOf(
          deployer.address
        );

        // should be allowed to redeem this amount
        expect(redeemPercentage).to.be.lt(reservePercentage);
        const redeemableAptBalance = newAptBalance
          .mul(redeemPercentage)
          .div(100);
        const originalUsdcBalance = tokenAmountToBigNumber(
          depositTokens,
          decimals
        );
        const redeemedUsdcAmount = originalUsdcBalance
          .mul(redeemPercentage)
          .div(100);
        const redeemedUsdcAfterFee = redeemedUsdcAmount
          .mul(BigNumber.from(100).sub(reservePercentage))
          .div(100);
        const usdcBalanceAfterRedeem =
          originalUsdcBalance.sub(redeemedUsdcAfterFee);
        const expectedUnderlyerAmount = usdcBalanceAfterRedeem
          .add(depositAmount)
          .mul(redeemPercentage)
          .div(100);
        const expectedUnderlyerAmountAfterFee = expectedUnderlyerAmount
          .mul(95)
          .div(100);
        await expect(usdcPool.redeem(redeemableAptBalance)).to.not.be.reverted;

        const newUnderlyerBalance = await usdcToken.balanceOf(deployer.address);
        const underlyerAmount = newUnderlyerBalance.sub(prevUnderlyerBalance);
        // allow a few wei deviation
        expect(
          underlyerAmount.sub(expectedUnderlyerAmountAfterFee).abs()
        ).to.be.lt(3);
      });

      it("Increase in TVL should increase value of APT holdings", async () => {
        // increase TVL by 10 percent
        const newTvl = (await oracleAdapter.getTvl()).mul(110).div(100);
        await oracleAdapter.connect(emergencySafe).emergencySetTvl(newTvl, 50);

        const poolBalance = await usdcToken.balanceOf(usdcPool.address);
        const lpAccountBalance = await usdcToken.balanceOf(lpAccount.address);
        const lpAccountBalanceWithYield = lpAccountBalance.mul(110).div(100);

        const expectedUnderlyerAmount = poolBalance.add(
          lpAccountBalanceWithYield
        );

        const aptBalance = await usdcPool.balanceOf(deployer.address);
        expect(await usdcPool.totalSupply()).to.equal(aptBalance);
        const underlyerAmount = await usdcPool.getUnderlyerAmount(aptBalance);
        // allow a few wei deviation
        expect(underlyerAmount.sub(expectedUnderlyerAmount).abs()).to.be.lt(3);
      });

      it("Top-up again after TVL increase", async () => {
        const lpAccountBalance = await usdcToken.balanceOf(lpAccount.address);

        const transferAmount = await usdcPool.getReserveTopUpValue();
        // Because of the amount of liquidity we added since the last top-up,
        // this is now negative.
        expect(transferAmount).to.be.lt(0);
        await expect(mApt.fundLpAccount([usdcPoolId])).to.not.be.reverted;

        await updateTvlAfterTransfer(usdcPool, transferAmount);

        // need to adjust also by the 10% yield
        const lpAccountBalanceWithYield = lpAccountBalance.mul(110).div(100);
        const expectedPoolBalance = lpAccountBalanceWithYield
          .add(transferAmount.mul(-1))
          .mul(reservePercentage)
          .div(100);

        const poolBalance = await usdcToken.balanceOf(usdcPool.address);
        // allow a few wei deviation
        expect(poolBalance.sub(expectedPoolBalance).abs()).to.be.lt(3);
      });

      it("Can withdraw to pool when top-up is more than available", async () => {
        // Increase TVL so that the top-up amount is much larger than
        // the LP Account balance
        const prevTvl = await oracleAdapter.getTvl();
        const tvl = prevTvl.mul(1000);
        await oracleAdapter.connect(emergencySafe).emergencySetTvl(tvl, 50);

        const [usdcAvailableAmount] = await mApt.getLpAccountBalances([
          usdcPoolId,
        ]);
        console.debug("Available amount (USDC): %s", usdcAvailableAmount);
        const [, rebalanceAmounts] = await mApt.getRebalanceAmounts([
          usdcPoolId,
        ]);
        console.debug("Rebalance amount (USDC): %s", rebalanceAmounts[0]);
        expect(usdcAvailableAmount).to.be.lt(rebalanceAmounts[0]);

        const poolBalance = await usdcToken.balanceOf(usdcPool.address);
        await mApt.withdrawFromLpAccount([usdcPoolId]);
        expect(await usdcToken.balanceOf(usdcPool.address)).to.equal(
          poolBalance.add(usdcAvailableAmount)
        );

        await setTvlToLpAccountValue();
      });

      it("Can withdraw the full TVL by setting high reserve pool size", async () => {
        // Reset TVL to the actual USD value of LP Account balances to
        // undo previous TVL manipulations.
        await setTvlToLpAccountValue();

        const startLpDaiBalance = await daiToken.balanceOf(lpAccount.address);
        const startLpUsdcBalance = await usdcToken.balanceOf(lpAccount.address);
        const startLpUsdtBalance = await usdtToken.balanceOf(lpAccount.address);

        const amount = "1500";

        const daiDecimals = 18;
        const daiDeposit = tokenAmountToBigNumber(amount, daiDecimals);
        await daiToken.approve(daiPool.address, daiDeposit);
        await daiPool.addLiquidity(daiDeposit);

        const usdcDecimals = 6;
        const usdcDeposit = tokenAmountToBigNumber(amount, usdcDecimals);
        await usdcToken.approve(usdcPool.address, usdcDeposit);
        await usdcPool.addLiquidity(usdcDeposit);

        const usdtDecimals = 6;
        const usdtDeposit = tokenAmountToBigNumber(amount, usdtDecimals);
        await usdtToken.approve(usdtPool.address, usdtDeposit);
        await usdtPool.addLiquidity(usdtDeposit);

        const poolIds = [daiPoolId, usdcPoolId, tetherPoolId];

        let [, [daiTopUp, usdcTopUp, usdtTopUp]] =
          await mApt.getRebalanceAmounts(poolIds);
        // check that fund will move capital from pools to LP Account
        expect(daiTopUp).to.be.lt(0);
        expect(usdcTopUp).to.be.lt(0);
        expect(usdtTopUp).to.be.lt(0);

        await mApt.fundLpAccount(poolIds);

        await updateTvlAfterTransfer(daiPool, daiTopUp);
        await updateTvlAfterTransfer(usdcPool, usdcTopUp);
        await updateTvlAfterTransfer(usdtPool, usdtTopUp);

        const prevLpDaiBalance = await daiToken.balanceOf(lpAccount.address);
        expect(prevLpDaiBalance.sub(startLpDaiBalance)).to.equal(
          daiTopUp.abs()
        );

        const prevLpUsdcBalance = await usdcToken.balanceOf(lpAccount.address);
        expect(prevLpUsdcBalance.sub(startLpUsdcBalance)).to.equal(
          usdcTopUp.abs()
        );

        const prevLpUsdtBalance = await usdtToken.balanceOf(lpAccount.address);
        expect(prevLpUsdtBalance.sub(startLpUsdtBalance)).to.equal(
          usdtTopUp.abs()
        );

        const reservePoolSize = ethers.BigNumber.from("1000000000000000000");
        await daiPool.connect(adminSafe).setReservePercentage(reservePoolSize);
        await usdcPool.connect(adminSafe).setReservePercentage(reservePoolSize);
        await usdtPool.connect(adminSafe).setReservePercentage(reservePoolSize);

        [, [daiTopUp, usdcTopUp, usdtTopUp]] = await mApt.getRebalanceAmounts(
          poolIds
        );
        // check that fund will move capital from LP Account to pools
        expect(daiTopUp).to.be.gt(0);
        expect(usdcTopUp).to.be.gt(0);
        expect(usdtTopUp).to.be.gt(0);
        console.debug("DAI topup: %s", daiTopUp);
        console.debug("DAI balance: %s", prevLpDaiBalance);
        console.debug("USDC topup: %s", usdcTopUp);
        console.debug("USDC balance: %s", prevLpUsdcBalance);
        console.debug("Tether topup: %s", usdtTopUp);
        console.debug("Tether balance: %s", prevLpUsdtBalance);

        await oracleAdapter.connect(emergencySafe).emergencyUnlock();

        // Swap all stables to DAI and top-up DAI pool.
        //
        // A prior version of `withdrawFromLpAccount` used to
        // revert if the available DAI balance for the LP account
        // was less than the top-up amount.
        //
        // Since the revert no longer happens, we need to do the
        // swaps to ensure we do the full top-up.
        await lpAccount
          .connect(lpSafe)
          .swapWith3Pool(1, 0, prevLpUsdcBalance, 0);
        await lpAccount
          .connect(lpSafe)
          .swapWith3Pool(2, 0, prevLpUsdtBalance, 0);
        await setTvlToLpAccountValue();
        await mApt.withdrawFromLpAccount([daiPoolId]);
        await setTvlToLpAccountValue();

        // Swap DAI to USDC and top-up USDC pool.
        const currentDaiBalance = await daiToken.balanceOf(lpAccount.address);
        await lpAccount
          .connect(lpSafe)
          .swapWith3Pool(0, 1, currentDaiBalance, 0);
        await setTvlToLpAccountValue();
        await mApt.withdrawFromLpAccount([usdcPoolId]);
        await setTvlToLpAccountValue();

        // Swap USDC to Tether and top-up Tether pool.
        const currentUsdcBalance = await usdcToken.balanceOf(lpAccount.address);
        await lpAccount
          .connect(lpSafe)
          .swapWith3Pool(1, 2, currentUsdcBalance, 0);
        await setTvlToLpAccountValue();
        await mApt.withdrawFromLpAccount([tetherPoolId]);
        await setTvlToLpAccountValue();

        const newLpDaiBalance = await daiToken.balanceOf(lpAccount.address);
        expect(newLpDaiBalance).to.be.lte(
          tokenAmountToBigNumber("0.0000001", daiDecimals)
        );

        const newLpUsdcBalance = await usdcToken.balanceOf(lpAccount.address);
        expect(newLpUsdcBalance).to.be.lte(
          tokenAmountToBigNumber("0.000001", usdcDecimals)
        );

        const newLpUsdtBalance = await usdtToken.balanceOf(lpAccount.address);
        expect(newLpUsdtBalance).to.be.lte(
          tokenAmountToBigNumber("0.000001", usdtDecimals)
        );
      });
    });
  });
});
