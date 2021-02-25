require("dotenv").config();
const { assert, expect } = require("chai");
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
 * @returns {[Contract, Signer]}
 */
async function upgradeManager(managerDeployerAddress) {
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
  await managerAdmin.upgrade(
    legos.apy.addresses.APY_MANAGER,
    newManagerLogic.address
  );
  const manager = await ethers.getContractAt(
    "APYManagerV2",
    legos.apy.addresses.APY_MANAGER,
    managerDeployer
  );

  return [manager, managerDeployer];
}

describe("Contract: APYManager - deployStrategy", () => {
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

    [manager] = await upgradeManager(MANAGER_DEPLOYER);
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
      manager.connect(nonOwner).deployStrategy(executor.address)
    ).to.be.revertedWith("revert Ownable: caller is not the owner");
  });

  it("Owner can call", async () => {
    const stratAddress = await manager.callStatic.deployStrategy(
      executor.address
    );
    // manager.once(
    //   manager.filters.StrategyDeployed(),
    //   (strategy, genericExecutor) => {
    //     assert.equal(strategy, stratAddress);
    //     assert.equal(genericExecutor, executor.address);
    //   }
    // );
    await expect(manager.deployStrategy(executor.address)).to.not.be.reverted;

    const strategy = await ethers.getContractAt("Strategy", stratAddress);
    expect(await strategy.owner()).to.equal(manager.address);
  });
});

describe("Contract: APYManager", () => {
  let daiPool;
  let usdcPool;
  let usdtPool;

  let manager;
  let mApt;
  let executor;
  let strategyAddress;

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

    /* unlock and fund Mainnet deployers */
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
    /***************************/

    /***********************************/
    /* upgrade pools and manager to V2 */
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

    [manager, managerDeployer] = await upgradeManager(MANAGER_DEPLOYER);

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
    /******** upgrades finished **********/

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
    const ethUsdAgg = await deployMockContract(deployer, []);

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
      ethUsdAgg.address,
      aggStalePeriod
    );
    await proxy.deployed();

    mApt = await APYMetaPoolToken.attach(proxy.address);
    await mApt.setManagerAddress(manager.address);
    await manager.setMetaPoolToken(mApt.address);
    /***** deployment finished *****/

    const APYGenericExecutor = await ethers.getContractFactory(
      "APYGenericExecutor"
    );
    executor = await APYGenericExecutor.deploy();
    await executor.deployed();

    strategyAddress = await manager.callStatic.deployStrategy(executor.address);
    await manager.deployStrategy(executor.address);

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

  describe("Fund Strategy", () => {
    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      await expect(
        manager.connect(nonOwner).fundStrategy(strategyAddress, [
          [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
          ["10", "10", "10"],
        ])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can call", async () => {
      await expect(
        manager
          .connect(managerDeployer)
          .fundStrategy(strategyAddress, [[bytes32("daiPool")], ["10"]])
      ).to.not.be.reverted;
    });

    it("Unregistered pool fails", async () => {
      await expect(
        manager.fundStrategy(strategyAddress, [
          [bytes32("daiPool"), bytes32("invalidPoolId"), bytes32("usdtPool")],
          ["10", "10", "10"],
        ])
      ).to.be.revertedWith("Missing address");
    });

    it("Check underlyer balances", async () => {
      // ETHERS contract.on() event listener doesnt seems to be working for some reason.
      // It might be because the event is not at the top most level

      // pre-conditions
      expect(await daiToken.balanceOf(strategyAddress)).to.equal(0);
      expect(await usdcToken.balanceOf(strategyAddress)).to.equal(0);
      expect(await usdtToken.balanceOf(strategyAddress)).to.equal(0);

      // start the tests

      const daiPoolBalance = await daiToken.balanceOf(daiPool.address);
      const usdcPoolBalance = await usdcToken.balanceOf(usdcPool.address);
      const usdtPoolBalance = await usdtToken.balanceOf(usdtPool.address);

      const daiAmount = tokenAmountToBigNumber("10", "18");
      const usdcAmount = tokenAmountToBigNumber("10", "6");
      const usdtAmount = tokenAmountToBigNumber("10", "6");

      await manager.fundStrategy(strategyAddress, [
        [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
        [daiAmount, usdcAmount, usdtAmount],
      ]);

      const stratDaiBalance = await daiToken.balanceOf(strategyAddress);
      const stratUsdcBalance = await usdcToken.balanceOf(strategyAddress);
      const stratUsdtBalance = await usdtToken.balanceOf(strategyAddress);

      expect(stratDaiBalance).to.equal(daiAmount);
      expect(stratUsdcBalance).to.equal(usdcAmount);
      expect(stratUsdtBalance).to.equal(usdtAmount);

      expect(await daiToken.balanceOf(daiPool.address)).to.equal(
        daiPoolBalance.sub(daiAmount)
      );
      expect(await usdcToken.balanceOf(usdcPool.address)).to.equal(
        usdcPoolBalance.sub(usdcAmount)
      );
      expect(await usdtToken.balanceOf(usdtPool.address)).to.equal(
        usdtPoolBalance.sub(usdtAmount)
      );
    });

    it("Check mAPT balances", async () => {
      // pre-conditions
      expect(await mApt.balanceOf(daiPool.address)).to.equal("0");
      expect(await mApt.balanceOf(usdcToken.address)).to.equal("0");
      expect(await mApt.balanceOf(usdtToken.address)).to.equal("0");

      await impersonateAccount(manager);
      await funder.sendTransaction({
        to: manager.address,
        value: ethers.utils.parseEther("10").toHexString(),
      });
      const managerSigner = await ethers.provider.getSigner(manager.address);
      await mApt
        .connect(managerSigner)
        .mint(deployer.address, tokenAmountToBigNumber("100"));

      const daiAmount = tokenAmountToBigNumber("10", "18");
      const usdcAmount = tokenAmountToBigNumber("10", "6");
      const usdtAmount = tokenAmountToBigNumber("10", "6");

      let tokenEthPrice = await daiPool.getTokenEthPrice();
      let decimals = await daiToken.decimals();
      const daiPoolMintAmount = await mApt.calculateMintAmount(
        daiAmount,
        tokenEthPrice,
        decimals
      );
      tokenEthPrice = await usdcPool.getTokenEthPrice();
      decimals = await usdcToken.decimals();
      const usdcPoolMintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        tokenEthPrice,
        decimals
      );
      tokenEthPrice = await usdtPool.getTokenEthPrice();
      decimals = await usdtToken.decimals();
      const usdtPoolMintAmount = await mApt.calculateMintAmount(
        usdtAmount,
        tokenEthPrice,
        decimals
      );

      await manager.fundStrategy(strategyAddress, [
        [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
        [daiAmount, usdcAmount, usdtAmount],
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

  describe("Fund and Execute", () => {
    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      await expect(
        manager
          .connect(nonOwner)
          .fundAndExecute(
            strategyAddress,
            [[bytes32("daiPool")], ["100"]],
            [
              [
                "0x6B175474E89094C44Da98b954EedeAC495271d0F",
                "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
              ],
            ]
          )
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Unregistered pool fails", async () => {
      await expect(
        manager.fundAndExecute(
          strategyAddress,
          [[bytes32("invalidPool")], ["100"]],
          [
            [
              daiToken.address,
              "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
            ],
          ]
        )
      ).to.be.revertedWith("Missing address");
    });

    it("Owner can call", async () => {
      await manager.fundAndExecute(
        strategyAddress,
        [[bytes32("daiPool")], ["100"]],
        [
          [
            daiToken.address,
            "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
          ],
        ]
      );
      const stratDaiBal = await daiToken.balanceOf(strategyAddress);
      const stratUsdcBal = await usdcToken.balanceOf(strategyAddress);
      const stratUsdtBal = await usdtToken.balanceOf(strategyAddress);

      // NOTE: DAI, USDC, and USDT funded to the account before with 10
      assert.equal(stratDaiBal.toString(), "100");
      assert.equal(stratUsdcBal.toString(), "0");
      assert.equal(stratUsdtBal.toString(), "0");
    });
  });

  describe("Execute", () => {
    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      // sequence is to give approval to DAI and cDAI @ 100 each
      await expect(
        manager
          .connect(nonOwner)
          .execute(strategyAddress, [
            [
              daiToken.address,
              "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
            ],
          ])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can call", async () => {
      // sequence is to give approval to DAI and cDAI @ 100 each
      await manager.execute(strategyAddress, [
        [
          daiToken.address,
          "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
        ],
      ]);

      const daiAllowance = await daiToken.allowance(
        strategyAddress,
        manager.address
      );

      assert.equal(daiAllowance.toString(), "100");
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

    before("Approve manager for strategy transfer", async () => {
      const IDetailedERC20 = artifacts.require("IDetailedERC20");
      const ifaceERC20 = new ethers.utils.Interface(IDetailedERC20.abi);

      daiApprove = ifaceERC20.encodeFunctionData("approve(address,uint256)", [
        manager.address,
        daiAmount,
      ]);
      await manager.execute(strategyAddress, [[daiToken.address, daiApprove]]);

      usdcApprove = ifaceERC20.encodeFunctionData("approve(address,uint256)", [
        manager.address,
        usdcAmount,
      ]);
      await manager.execute(strategyAddress, [
        [usdcToken.address, usdcApprove],
      ]);

      usdtApprove = ifaceERC20.encodeFunctionData("approve(address,uint256)", [
        manager.address,
        usdtAmount,
      ]);
      await manager.execute(strategyAddress, [
        [usdtToken.address, usdtApprove],
      ]);
    });

    describe("Execute and Withdraw", () => {
      it("Non-owner cannot call", async () => {
        const nonOwner = await ethers.provider.getSigner(randomAccount.address);
        await expect(
          manager
            .connect(nonOwner)
            .executeAndWithdraw(
              strategyAddress,
              [[bytes32("daiPool")], ["100"]],
              [[daiToken.address, daiApprove]]
            )
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Unregistered pool fails", async () => {
        await expect(
          manager.executeAndWithdraw(
            strategyAddress,
            [[bytes32("invalidPool")], ["100"]],
            [[daiToken.address, daiApprove]]
          )
        ).to.be.revertedWith("Missing address");
      });

      it("Owner can call", async () => {
        const amount = "10";
        await daiToken.connect(funder).transfer(strategyAddress, amount);
        expect(await daiToken.balanceOf(strategyAddress)).to.equal(amount);

        await manager.executeAndWithdraw(
          strategyAddress,
          [[bytes32("daiPool")], [amount]],
          [[daiToken.address, daiApprove]]
        );

        expect(await daiToken.balanceOf(strategyAddress)).to.equal(0);
      });
    });

    describe("withdrawFromStrategy", () => {
      it("Non-owner cannot call", async () => {
        const nonOwner = await ethers.provider.getSigner(randomAccount.address);
        await expect(
          manager.connect(nonOwner).withdrawFromStrategy(strategyAddress, [
            [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
            ["10", "10", "10"],
          ])
        ).to.be.revertedWith("revert Ownable: caller is not the owner");
      });

      it("Unregistered pool fails", async () => {
        await expect(
          manager.withdrawFromStrategy(strategyAddress, [
            [bytes32("invalidPool")],
            ["10"],
          ])
        ).to.be.revertedWith("Missing address");
      });

      it("Owner can call", async () => {
        const amount = "10";
        await daiToken.connect(funder).transfer(strategyAddress, amount);
        expect(await daiToken.balanceOf(strategyAddress)).to.equal(amount);

        // ETHERS contract.on() event listener doesnt seems to be working for some reason.
        // It might be because the event is not at the top most level

        await expect(
          manager.withdrawFromStrategy(strategyAddress, [
            [bytes32("daiPool")],
            [amount],
          ])
        ).to.not.be.reverted;

        expect(await daiToken.balanceOf(strategyAddress)).to.equal(0);
      });
    });

    it("Check mAPT balances (non-zero supply)", async () => {
      // make mAPT total supply non-zero by minting to deployer
      await impersonateAccount(manager);
      await funder.sendTransaction({
        to: manager.address,
        value: ethers.utils.parseEther("10").toHexString(),
      });
      const managerSigner = await ethers.provider.getSigner(manager.address);
      await mApt
        .connect(managerSigner)
        .mint(deployer.address, tokenAmountToBigNumber("1000000"));
      // don't forget to update the TVL!
      const tvl = tokenAmountToBigNumber("85000");
      await mApt.setTVL(tvl);

      // now mint for each pool so withdraw can burn tokens
      let tokenEthPrice = await daiPool.getTokenEthPrice();
      let decimals = await daiToken.decimals();
      const daiPoolMintAmount = await mApt.calculateMintAmount(
        // daiAmount.mul(2),
        daiAmount,
        tokenEthPrice,
        decimals
      );
      tokenEthPrice = await usdcPool.getTokenEthPrice();
      decimals = await usdcToken.decimals();
      const usdcPoolMintAmount = await mApt.calculateMintAmount(
        // usdcAmount.mul(2),
        usdcAmount,
        tokenEthPrice,
        decimals
      );
      tokenEthPrice = await usdtPool.getTokenEthPrice();
      decimals = await usdtToken.decimals();
      const usdtPoolMintAmount = await mApt.calculateMintAmount(
        // usdtAmount.mul(2),
        usdtAmount,
        tokenEthPrice,
        decimals
      );
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
      await daiToken.connect(funder).transfer(strategyAddress, daiAmount);
      await usdcToken.connect(funder).transfer(strategyAddress, usdcAmount);
      await usdtToken.connect(funder).transfer(strategyAddress, usdtAmount);
      // also adjust the TVL appropriately, as there is no Chainlink to update it
      const daiValue = await daiPool.getEthValueFromTokenAmount(daiAmount);
      const usdcValue = await usdcPool.getEthValueFromTokenAmount(usdcAmount);
      const usdtValue = await usdtPool.getEthValueFromTokenAmount(usdtAmount);
      const newTvl = tvl.add(daiValue).add(usdcValue).add(usdtValue);
      await mApt.setTVL(newTvl);

      tokenEthPrice = await daiPool.getTokenEthPrice();
      decimals = await daiToken.decimals();
      const daiPoolBurnAmount = await mApt.calculateMintAmount(
        daiAmount.div(2),
        tokenEthPrice,
        decimals
      );
      tokenEthPrice = await usdcPool.getTokenEthPrice();
      decimals = await usdcToken.decimals();
      const usdcPoolBurnAmount = await mApt.calculateMintAmount(
        usdcAmount.div(5),
        tokenEthPrice,
        decimals
      );
      tokenEthPrice = await usdtPool.getTokenEthPrice();
      decimals = await usdtToken.decimals();
      const usdtPoolBurnAmount = await mApt.calculateMintAmount(
        usdtAmount,
        tokenEthPrice,
        decimals
      );

      await manager.withdrawFromStrategy(strategyAddress, [
        [bytes32("daiPool"), bytes32("usdcPool"), bytes32("usdtPool")],
        [daiAmount.div(2), usdcAmount.div(5), usdtAmount],
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
