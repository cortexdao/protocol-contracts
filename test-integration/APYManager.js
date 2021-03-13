require("dotenv").config();
const { expect } = require("chai");
const { artifacts, ethers } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const legos = require("@apy-finance/defi-legos");
const {
  tokenAmountToBigNumber,
  impersonateAccount,
  bytes32,
  acquireToken,
} = require("../utils/helpers");
const { deployMockContract } = require("ethereum-waffle");
const { STABLECOIN_POOLS } = require("../utils/constants");

const IDetailedERC20 = artifacts.require("IDetailedERC20");
const erc20Interface = new ethers.utils.Interface(
  artifacts.require("ERC20").abi
);

const POOL_DEPLOYER = "0x6EAF0ab3455787bA10089800dB91F11fDf6370BE";
const MANAGER_DEPLOYER = "0x0f7B66a4a3f7CfeAc2517c2fb9F0518D48457d41";

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

/**
 * Returns the upgraded (V2) manager contract instance, in addition
 * to the signer for the manager's deployer.
 * @param {address} managerDeployerAddress
 * @param {address} mAptAddress  - need for initializeUpgrade
 * @param {address} allocationRegistryAddress  - need for initializeUpgrade
 * @returns {[Contract, Signer]}
 */
async function upgradeManager(
  managerDeployerAddress,
  mAptAddress,
  allocationRegistryAddress
) {
  const managerDeployer = await ethers.provider.getSigner(
    managerDeployerAddress
  );

  const APYManagerV2 = await ethers.getContractFactory("APYManagerV2");
  const newManagerLogic = await APYManagerV2.deploy();
  await newManagerLogic.deployed();

  const managerAdmin = await ethers.getContractAt(
    legos.apy.abis.APY_MANAGER_Admin,
    legos.apy.addresses.APY_MANAGER_Admin,
    managerDeployer
  );
  const initData = APYManagerV2.interface.encodeFunctionData(
    "initializeUpgrade(address,address)",
    [mAptAddress, allocationRegistryAddress]
  );
  await managerAdmin.upgradeAndCall(
    legos.apy.addresses.APY_MANAGER,
    newManagerLogic.address,
    initData
  );
  const manager = await ethers.getContractAt(
    "APYManagerV2",
    legos.apy.addresses.APY_MANAGER,
    managerDeployer
  );

  return [manager, managerDeployer];
}

describe("Contract: APYManager - deployAccount", () => {
  let manager;
  let executor;

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
    const [funder] = await ethers.getSigners();
    await funder.sendTransaction({
      to: MANAGER_DEPLOYER,
      value: ethers.utils.parseEther("10").toHexString(),
    });
    await impersonateAccount(MANAGER_DEPLOYER);

    const dummyContract = await deployMockContract(funder, []);
    [manager] = await upgradeManager(
      MANAGER_DEPLOYER,
      dummyContract.address,
      dummyContract.address
    );
    const APYGenericExecutor = await ethers.getContractFactory(
      "APYGenericExecutor"
    );
    executor = await APYGenericExecutor.deploy();
    await executor.deployed();
  });

  it("non-owner cannot call", async () => {
    const nonOwner = (await ethers.getSigners())[0];
    expect(await manager.owner()).to.not.equal(nonOwner.address);

    await expect(
      manager
        .connect(nonOwner)
        .deployAccount(bytes32("account1"), executor.address)
    ).to.be.revertedWith("revert Ownable: caller is not the owner");
  });

  it("Owner can call", async () => {
    const accountAddress = await manager.callStatic.deployAccount(
      bytes32("account1"),
      executor.address
    );
    // manager.once(
    //   manager.filters.AccountDeployed(),
    //   (strategy, genericExecutor) => {
    //     assert.equal(strategy, stratAddress);
    //     assert.equal(genericExecutor, executor.address);
    //   }
    // );
    await expect(manager.deployAccount(bytes32("account1"), executor.address))
      .to.not.be.reverted;

    const account = await ethers.getContractAt("APYAccount", accountAddress);
    expect(await account.owner()).to.equal(manager.address);
  });
});

describe("Contract: APYManager", () => {
  let daiPool;
  let usdcPool;
  let usdtPool;

  let manager;
  let allocationRegistry;
  let mApt;
  let executor;
  let accountAddress;

  let managerDeployer;
  let deployer;
  let funder;
  let randomAccount;

  let daiToken;
  let usdcToken;
  let usdtToken;

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
    [deployer, funder, randomAccount] = await ethers.getSigners();

    /*************************************/
    /* unlock and fund Mainnet deployers */
    /*************************************/
    await funder.sendTransaction({
      to: POOL_DEPLOYER,
      value: ethers.utils.parseEther("10").toHexString(),
    });
    await impersonateAccount(POOL_DEPLOYER);

    await funder.sendTransaction({
      to: MANAGER_DEPLOYER,
      value: ethers.utils.parseEther("10").toHexString(),
    });
    await impersonateAccount(MANAGER_DEPLOYER);

    /***********************************/
    /* upgrade pools to V2 */
    /***********************************/
    const poolDeployer = await ethers.provider.getSigner(POOL_DEPLOYER);
    const APYPoolTokenV2 = await ethers.getContractFactory("APYPoolTokenV2");
    const newPoolLogic = await APYPoolTokenV2.deploy();
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

    // approve manager to withdraw from pools
    daiPool = await ethers.getContractAt(
      "APYPoolTokenV2",
      legos.apy.addresses.APY_DAI_POOL,
      poolDeployer
    );
    usdcPool = await ethers.getContractAt(
      "APYPoolTokenV2",
      legos.apy.addresses.APY_USDC_POOL,
      poolDeployer
    );
    usdtPool = await ethers.getContractAt(
      "APYPoolTokenV2",
      legos.apy.addresses.APY_USDT_POOL,
      poolDeployer
    );
    await daiPool.infiniteApprove(legos.apy.addresses.APY_MANAGER);
    await usdcPool.infiniteApprove(legos.apy.addresses.APY_MANAGER);
    await usdtPool.infiniteApprove(legos.apy.addresses.APY_MANAGER);

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
    const tvlAgg = await deployMockContract(deployer, []);

    const APYMetaPoolTokenProxy = await ethers.getContractFactory(
      "APYMetaPoolTokenProxy"
    );
    // Use the *test* contract so we can set the TVL
    const APYMetaPoolToken = await ethers.getContractFactory(
      "TestAPYMetaPoolToken"
    );
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");

    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    const logic = await APYMetaPoolToken.deploy();
    await logic.deployed();

    const aggStalePeriod = 14400;
    const proxy = await APYMetaPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      tvlAgg.address,
      aggStalePeriod
    );
    await proxy.deployed();

    mApt = await APYMetaPoolToken.attach(proxy.address);
    await mApt.setManagerAddress(legos.apy.addresses.APY_MANAGER);

    /*******************************************/
    /***** deploy asset allocation registry ****/
    /*******************************************/
    const APYAssetAllocationRegistry = await ethers.getContractFactory(
      "APYAssetAllocationRegistry"
    );
    allocationRegistry = await APYAssetAllocationRegistry.deploy(
      legos.apy.addresses.APY_MANAGER
    );
    await allocationRegistry.deployed();

    /***********************************/
    /***** upgrade manager to V2 *******/
    /***********************************/
    [manager, managerDeployer] = await upgradeManager(
      MANAGER_DEPLOYER,
      mApt.address,
      allocationRegistry.address
    );
    /*********************************************/
    /* main deployments and upgrades finished 
    /*********************************************/

    const APYGenericExecutor = await ethers.getContractFactory(
      "APYGenericExecutor"
    );
    executor = await APYGenericExecutor.deploy();
    await executor.deployed();

    accountAddress = await manager.callStatic.deployAccount(
      bytes32("account1"),
      executor.address
    );
    await manager.deployAccount(bytes32("account1"), executor.address);

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
      funder,
      daiToken,
      "1000",
      funder
    );
    await acquireToken(
      STABLECOIN_POOLS["USDC"],
      funder,
      usdcToken,
      "1000",
      funder
    );
    await acquireToken(
      STABLECOIN_POOLS["USDT"],
      funder,
      usdtToken,
      "1000",
      funder
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

  describe("fundAccount", () => {
    // standard amounts we use in our tests
    const dollars = 100;
    const daiAmount = tokenAmountToBigNumber(dollars, 18);
    const usdcAmount = tokenAmountToBigNumber(dollars, 6);
    const usdtAmount = tokenAmountToBigNumber(dollars, 6);

    // used for test setups needing minting of mAPT
    let managerSigner;

    /** needed for the manager to be able to mint mAPT in test setups */
    before("Setup manager for sending transactions", async () => {
      await impersonateAccount(manager);
      await funder.sendTransaction({
        to: manager.address,
        value: ethers.utils.parseEther("10").toHexString(),
      });
      managerSigner = await ethers.provider.getSigner(manager.address);
    });

    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      await expect(
        manager.connect(nonOwner).fundAccount(bytes32("account1"), [[], []], [])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can call", async () => {
      await expect(
        manager
          .connect(managerDeployer)
          .fundAccount(bytes32("account1"), [[], []], [])
      ).to.not.be.reverted;
    });

    it("Unregistered pool fails", async () => {
      await expect(
        manager.fundAccount(
          bytes32("account1"),
          [
            [bytes32("daiPool"), bytes32("invalidPoolId"), bytes32("usdtPool")],
            ["10", "10", "10"],
          ],
          []
        )
      ).to.be.revertedWith("Missing address");
    });

    it("Transfers correct underlyer amounts and updates asset allocation registry", async () => {
      // ETHERS contract.on() event listener doesnt seems to be working for some reason.
      // It might be because the event is not at the top most level

      // pre-conditions
      expect(await daiToken.balanceOf(accountAddress)).to.equal(0);
      expect(await usdcToken.balanceOf(accountAddress)).to.equal(0);
      expect(await usdtToken.balanceOf(accountAddress)).to.equal(0);

      // start the tests
      const daiPoolBalance = await daiToken.balanceOf(daiPool.address);
      const usdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
      const usdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);

      const encodedBalanceOf = erc20Interface.encodeFunctionData(
        "balanceOf(address)",
        [accountAddress]
      );

      await manager.fundAccount(
        bytes32("account1"),
        [
          [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
          [daiAmount, usdcAmount, usdtAmount],
        ],
        [
          [
            bytes32("strat1DaiBal"),
            "DAI",
            18,
            [daiToken.address, encodedBalanceOf],
          ],
          [
            bytes32("strat1UsdcBal"),
            "USDC",
            6,
            [usdcToken.address, encodedBalanceOf],
          ],
          [
            bytes32("strat1UsdtBal"),
            "USDT",
            6,
            [usdtToken.address, encodedBalanceOf],
          ],
        ]
      );

      const strategyDaiBalance = await daiToken.balanceOf(accountAddress);
      const strategyUsdcBalance = await usdcToken.balanceOf(accountAddress);
      const strategyUsdtBalance = await usdtToken.balanceOf(accountAddress);

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

      // Check the manager registered the asset allocations corretly
      const registeredIds = await allocationRegistry.getAssetAllocationIds();
      expect(registeredIds.length).to.equal(3);
      expect(registeredIds[0]).to.equal(bytes32("strat1DaiBal"));
      expect(registeredIds[1]).to.equal(bytes32("strat1UsdcBal"));
      expect(registeredIds[2]).to.equal(bytes32("strat1UsdtBal"));

      const registeredDaiSymbol = await allocationRegistry.symbolOf(
        registeredIds[0]
      );
      const registeredUsdcSymbol = await allocationRegistry.symbolOf(
        registeredIds[1]
      );
      const registeredUsdtSymbol = await allocationRegistry.symbolOf(
        registeredIds[2]
      );
      expect(registeredDaiSymbol).to.equal("DAI");
      expect(registeredUsdcSymbol).to.equal("USDC");
      expect(registeredUsdtSymbol).to.equal("USDT");

      const registeredDaiDecimals = await allocationRegistry.decimalsOf(
        registeredIds[0]
      );
      const registeredUsdcDecimals = await allocationRegistry.decimalsOf(
        registeredIds[1]
      );
      const registeredUsdtDecimals = await allocationRegistry.decimalsOf(
        registeredIds[2]
      );
      expect(registeredDaiDecimals).to.equal(18);
      expect(registeredUsdcDecimals).to.equal(6);
      expect(registeredUsdtDecimals).to.equal(6);

      const registeredStratDaiBal = await allocationRegistry.balanceOf(
        registeredIds[0]
      );
      const registeredStratUsdcBal = await allocationRegistry.balanceOf(
        registeredIds[1]
      );
      const registeredStratUsdtBal = await allocationRegistry.balanceOf(
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

      await manager.fundAccount(
        bytes32("account1"),
        [
          [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
          [daiAmount, usdcAmount, usdtAmount],
        ],
        []
      );

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

      await manager.fundAccount(
        bytes32("account1"),
        [
          [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
          [daiAmount, usdcAmount, usdtAmount],
        ],
        []
      );

      expect(await mApt.balanceOf(daiPool.address)).to.equal(daiPoolMintAmount);
      expect(await mApt.balanceOf(usdcPool.address)).to.equal(
        usdcPoolMintAmount
      );
      expect(await mApt.balanceOf(usdtPool.address)).to.equal(
        usdtPoolMintAmount
      );
    });
  });

  describe("fundAndExecute", () => {
    const amount = 100;
    let encodedApprove;

    before(async () => {
      encodedApprove = erc20Interface.encodeFunctionData(
        "approve(address,uint256)",
        [manager.address, amount]
      );
    });

    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      await expect(
        manager
          .connect(nonOwner)
          .fundAndExecute(
            bytes32("account1"),
            [[bytes32("daiPool")], [amount]],
            [[daiToken.address, encodedApprove]],
            []
          )
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can call", async () => {
      await expect(
        manager
          .connect(managerDeployer)
          .fundAndExecute(bytes32("account1"), [[], []], [], [])
      ).to.not.be.reverted;
    });

    it("Unregistered pool fails", async () => {
      await expect(
        manager
          .connect(managerDeployer)
          .fundAndExecute(
            bytes32("account1"),
            [[bytes32("invalidPool")], [amount]],
            [[daiToken.address, encodedApprove]],
            []
          )
      ).to.be.revertedWith("Missing address");
    });

    it("Transfers correct underlyer amounts and updates asset allocation registry", async () => {
      const encodedBalanceOf = erc20Interface.encodeFunctionData(
        "balanceOf(address)",
        [accountAddress]
      );

      await manager.fundAndExecute(
        bytes32("account1"),
        [[bytes32("daiPool")], [amount]],
        [[daiToken.address, encodedApprove]],
        [
          [
            bytes32("strat1DaiBal"),
            "DAI",
            18,
            [daiToken.address, encodedBalanceOf],
          ],
        ]
      );
      const strategyDaiBalance = await daiToken.balanceOf(accountAddress);
      const strategyUsdcBalance = await usdcToken.balanceOf(accountAddress);
      const strategyUsdtBalance = await usdtToken.balanceOf(accountAddress);

      expect(strategyDaiBalance).to.equal(amount);
      expect(strategyUsdcBalance).to.equal(0);
      expect(strategyUsdtBalance).to.equal(0);

      // Check the manager registered the asset allocations corretly
      const registeredIds = await allocationRegistry.getAssetAllocationIds();
      expect(registeredIds.length).to.equal(1);
      expect(registeredIds[0]).to.equal(bytes32("strat1DaiBal"));

      const registeredDaiSymbol = await allocationRegistry.symbolOf(
        registeredIds[0]
      );
      expect(registeredDaiSymbol).to.equal("DAI");

      const registeredDaiDecimals = await allocationRegistry.decimalsOf(
        registeredIds[0]
      );
      expect(registeredDaiDecimals).to.equal(18);

      const registeredStratDaiBal = await allocationRegistry.balanceOf(
        registeredIds[0]
      );
      expect(registeredStratDaiBal).equal(strategyDaiBalance);
    });
  });

  describe("Execute", () => {
    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      await expect(
        manager.connect(nonOwner).execute(bytes32("account1"), [], [])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can call", async () => {
      const encodedFunction = erc20Interface.encodeFunctionData("symbol()", []);
      await expect(
        manager.execute(
          bytes32("account1"),
          [[daiToken.address, encodedFunction]],
          []
        )
      ).to.not.be.reverted;
    });

    it("Calldata executes properly and updates asset allocation registry", async () => {
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
        bytes32("account1"),
        [[daiToken.address, encodedApprove]],
        [
          [
            bytes32("strat1DaiBal"),
            "DAI",
            18,
            [daiToken.address, encodedBalanceOf],
          ],
        ]
      );

      const daiAllowance = await daiToken.allowance(
        accountAddress,
        manager.address
      );
      expect(daiAllowance).to.equal(amount);

      // Check the manager registered the asset allocations corretly
      const registeredIds = await allocationRegistry.getAssetAllocationIds();
      expect(registeredIds.length).to.equal(1);
      expect(registeredIds[0]).to.equal(bytes32("strat1DaiBal"));

      const registeredDaiSymbol = await allocationRegistry.symbolOf(
        registeredIds[0]
      );
      expect(registeredDaiSymbol).to.equal("DAI");

      const registeredDaiDecimals = await allocationRegistry.decimalsOf(
        registeredIds[0]
      );
      expect(registeredDaiDecimals).to.equal(18);

      const registeredStratDaiBal = await allocationRegistry.balanceOf(
        registeredIds[0]
      );
      expect(registeredStratDaiBal).equal(0);
    });
  });

  describe("Withdrawing", () => {
    // standard amounts we use in our tests
    const dollars = 100;
    const daiAmount = tokenAmountToBigNumber(dollars, 18);
    const usdcAmount = tokenAmountToBigNumber(dollars, 6);
    const usdtAmount = tokenAmountToBigNumber(dollars, 6);

    // calldata to execute to approve manager for above amounts
    let daiApprove;
    let usdcApprove;
    let usdtApprove;

    // used for test setups needing minting of mAPT
    let managerSigner;

    /** manager needs to be approved to transfer tokens from strategy */
    before("Approve manager for strategy transfer", async () => {
      daiApprove = erc20Interface.encodeFunctionData(
        "approve(address,uint256)",
        [manager.address, daiAmount]
      );
      await manager.execute(
        bytes32("account1"),
        [[daiToken.address, daiApprove]],
        []
      );

      usdcApprove = erc20Interface.encodeFunctionData(
        "approve(address,uint256)",
        [manager.address, usdcAmount]
      );
      await manager.execute(
        bytes32("account1"),
        [[usdcToken.address, usdcApprove]],
        []
      );

      usdtApprove = erc20Interface.encodeFunctionData(
        "approve(address,uint256)",
        [manager.address, usdtAmount]
      );
      await manager.execute(
        bytes32("account1"),
        [[usdtToken.address, usdtApprove]],
        []
      );
    });

    /** needed for the manager to be able to mint mAPT in test setups */
    before("Setup manager for sending transactions", async () => {
      await impersonateAccount(manager);
      await funder.sendTransaction({
        to: manager.address,
        value: ethers.utils.parseEther("10").toHexString(),
      });
      managerSigner = await ethers.provider.getSigner(manager.address);
    });

    describe("executeAndWithdraw", () => {
      it("Non-owner cannot call", async () => {
        const nonOwner = await ethers.provider.getSigner(randomAccount.address);
        await expect(
          manager
            .connect(nonOwner)
            .executeAndWithdraw(bytes32("account1"), [[], []], [], [])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Unregistered pool fails", async () => {
        await expect(
          manager.executeAndWithdraw(
            bytes32("account1"),
            [[bytes32("invalidPool")], [0]],
            [],
            []
          )
        ).to.be.revertedWith("Missing address");
      });

      it("Owner can call", async () => {
        await expect(
          manager
            .connect(managerDeployer)
            .executeAndWithdraw(bytes32("account1"), [[], []], [], [])
        ).to.not.be.reverted;
      });

      it("Transfers underlyer correctly to one pool", async () => {
        const encodedBalanceOf = erc20Interface.encodeFunctionData(
          "balanceOf(address)",
          [accountAddress]
        );
        const amount = "10";
        await daiToken.connect(funder).transfer(accountAddress, amount);
        expect(await daiToken.balanceOf(accountAddress)).to.equal(amount);

        await manager.executeAndWithdraw(
          bytes32("account1"),
          [[bytes32("daiPool")], [amount]],
          [[daiToken.address, daiApprove]],
          [
            [
              bytes32("strat1DaiBal"),
              "DAI",
              18,
              [daiToken.address, encodedBalanceOf],
            ],
          ]
        );

        expect(await daiToken.balanceOf(accountAddress)).to.equal(0);

        // Check the manager registered the asset allocations corretly
        const registeredIds = await allocationRegistry.getAssetAllocationIds();
        expect(registeredIds.length).to.equal(1);
        expect(registeredIds[0]).to.equal(bytes32("strat1DaiBal"));

        const registeredDaiSymbol = await allocationRegistry.symbolOf(
          registeredIds[0]
        );
        expect(registeredDaiSymbol).to.equal("DAI");

        const registeredDaiDecimals = await allocationRegistry.decimalsOf(
          registeredIds[0]
        );
        expect(registeredDaiDecimals).to.equal(18);

        const registeredStratDaiBal = await allocationRegistry.balanceOf(
          registeredIds[0]
        );
        expect(registeredStratDaiBal).equal(0);
      });
    });

    describe("withdrawFromAccount", () => {
      it("Non-owner cannot call", async () => {
        const nonOwner = await ethers.provider.getSigner(randomAccount.address);
        await expect(
          manager
            .connect(nonOwner)
            .withdrawFromAccount(bytes32("account1"), [[], []], [])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Owner can call", async () => {
        await expect(
          manager
            .connect(managerDeployer)
            .withdrawFromAccount(bytes32("account1"), [[], []], [])
        ).to.not.be.reverted;
      });

      it("Unregistered pool fails", async () => {
        await expect(
          manager.withdrawFromAccount(
            bytes32("account1"),
            [[bytes32("invalidPool")], ["10"]],
            []
          )
        ).to.be.revertedWith("Missing address");
      });

      it("Transfers underlyer correctly for one pool", async () => {
        const amount = "10";
        await daiToken.connect(funder).transfer(accountAddress, amount);
        expect(await daiToken.balanceOf(accountAddress)).to.equal(amount);

        // ETHERS contract.on() event listener doesnt seems to be working for some reason.
        // It might be because the event is not at the top most level

        await manager.withdrawFromAccount(
          bytes32("account1"),
          [[bytes32("daiPool")], [amount]],
          []
        );

        expect(await daiToken.balanceOf(accountAddress)).to.equal(0);
      });

      it("Transfers and mints correctly for multiple pools (start from zero supply)", async () => {
        expect(await mApt.totalSupply()).to.equal(0);
        expect(await mApt.getTVL()).to.equal(0);

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
        await daiToken.connect(funder).transfer(accountAddress, daiAmount);
        await usdcToken.connect(funder).transfer(accountAddress, usdcAmount);
        await usdtToken.connect(funder).transfer(accountAddress, usdtAmount);
        // also adjust the TVL appropriately, as there is no Chainlink to update it
        const daiValue = await daiPool.getValueFromUnderlyerAmount(daiAmount);
        const usdcValue = await usdcPool.getValueFromUnderlyerAmount(
          usdcAmount
        );
        const usdtValue = await usdtPool.getValueFromUnderlyerAmount(
          usdtAmount
        );
        const newTvl = daiValue.add(usdcValue).add(usdtValue);
        await mApt.setTVL(newTvl);

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

        await manager.withdrawFromAccount(
          bytes32("account1"),
          [
            [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
            [daiWithdrawAmount, usdcWithdrawAmount, usdtWithdrawAmount],
          ],
          []
        );

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
        await mApt.setTVL(tvl);

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
        await daiToken.connect(funder).transfer(accountAddress, daiAmount);
        await usdcToken.connect(funder).transfer(accountAddress, usdcAmount);
        await usdtToken.connect(funder).transfer(accountAddress, usdtAmount);
        // also adjust the TVL appropriately, as there is no Chainlink to update it
        const daiValue = await daiPool.getValueFromUnderlyerAmount(daiAmount);
        const usdcValue = await usdcPool.getValueFromUnderlyerAmount(
          usdcAmount
        );
        const usdtValue = await usdtPool.getValueFromUnderlyerAmount(
          usdtAmount
        );
        const newTvl = tvl.add(daiValue).add(usdcValue).add(usdtValue);
        await mApt.setTVL(newTvl);

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

        await manager.withdrawFromAccount(bytes32("account1"), [
          [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
          [daiWithdrawAmount, usdcWithdrawAmount, usdtWithdrawAmount],
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
