require("dotenv").config();
const { assert, expect } = require("chai");
const { artifacts, ethers, network } = require("hardhat");
const legos = require("@apy-finance/defi-legos");
const { tokenAmountToBigNumber } = require("../utils/helpers");
const { deployMockContract } = require("ethereum-waffle");

const AggregatorV3Interface = artifacts.require("AggregatorV3Interface");

const POOL_DEPLOYER = "0x6EAF0ab3455787bA10089800dB91F11fDf6370BE";
const MANAGER_DEPLOYER = "0x0f7B66a4a3f7CfeAc2517c2fb9F0518D48457d41";

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("APYManager", () => {
  /*
   * I use hardhat to be able switch between accounts with impersonateAcccount functionality
   * ENABLE_FORKING=true yarn hardhat node
   * yarn test:integration --network localhost
   */

  let apyDaiPool;
  let apyUsdcPool;
  let apyUsdtPool;

  let manager;
  let mApt;
  let executor;
  let strategy;

  let managerDeployer;
  let deployer;
  let funder;
  let randomAccount;

  before(async () => {
    [deployer, funder, randomAccount] = await ethers.getSigners();

    /* unlock and fund Mainnet deployers */
    await funder.sendTransaction({
      to: POOL_DEPLOYER,
      value: ethers.utils.parseEther("10").toHexString(),
    });
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [POOL_DEPLOYER],
    });

    await funder.sendTransaction({
      to: MANAGER_DEPLOYER,
      value: ethers.utils.parseEther("10").toHexString(),
    });
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [MANAGER_DEPLOYER],
    });
    managerDeployer = await ethers.provider.getSigner(MANAGER_DEPLOYER);
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

    const APYManagerV2 = await ethers.getContractFactory("APYManagerV2");
    const newManagerLogic = await APYManagerV2.deploy();
    const managerAdmin = await ethers.getContractAt(
      legos.apy.abis.APY_MANAGER_Admin,
      legos.apy.addresses.APY_MANAGER_Admin,
      managerDeployer
    );
    await managerAdmin.upgrade(
      legos.apy.addresses.APY_MANAGER,
      newManagerLogic.address
    );

    // approve manager to withdraw from pools
    apyDaiPool = await ethers.getContractAt(
      "APYPoolTokenV2",
      legos.apy.addresses.APY_DAI_POOL,
      poolDeployer
    );
    apyUsdcPool = await ethers.getContractAt(
      "APYPoolTokenV2",
      legos.apy.addresses.APY_USDC_POOL,
      poolDeployer
    );
    apyUsdtPool = await ethers.getContractAt(
      "APYPoolTokenV2",
      legos.apy.addresses.APY_USDT_POOL,
      poolDeployer
    );
    await apyDaiPool.infiniteApprove(legos.apy.addresses.APY_MANAGER);
    await apyUsdcPool.infiniteApprove(legos.apy.addresses.APY_MANAGER);
    await apyUsdtPool.infiniteApprove(legos.apy.addresses.APY_MANAGER);

    manager = await ethers.getContractAt(
      "APYManagerV2",
      legos.apy.addresses.APY_MANAGER,
      managerDeployer
    );
    /******** upgrades finished **********/

    /***********************/
    /***** deploy mAPT *****/
    /***********************/
    const tvlAgg = await deployMockContract(
      deployer,
      AggregatorV3Interface.abi
    );
    const ethUsdAgg = await deployMockContract(
      deployer,
      AggregatorV3Interface.abi
    );

    const ethUsdPrice = tokenAmountToBigNumber("176767026385");
    const usdTvl = tokenAmountToBigNumber("2510012387654321");
    const updatedAt = (await ethers.provider.getBlock()).timestamp;
    // setting the mock mines a block and advances time by 1 sec
    await tvlAgg.mock.latestRoundData.returns(0, usdTvl, 0, updatedAt, 0);
    await ethUsdAgg.mock.latestRoundData.returns(
      0,
      ethUsdPrice,
      0,
      updatedAt,
      0
    );

    const APYMetaPoolTokenProxy = await ethers.getContractFactory(
      "APYMetaPoolTokenProxy"
    );
    const APYMetaPoolToken = await ethers.getContractFactory(
      "APYMetaPoolToken"
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
  });

  describe("Deploy Strategy", async () => {
    it("non-owner cannot call", async () => {
      const bad_signer = await ethers.provider.getSigner(randomAccount.address);
      const bad_MANAGER = await ethers.getContractAt(
        "APYManagerV2",
        legos.apy.addresses.APY_MANAGER,
        bad_signer
      );
      await expect(
        bad_MANAGER.deployStrategy(executor.address)
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it.only("Owner can call", async () => {
      const stratAddress = await manager.callStatic.deployStrategy(
        executor.address
      );
      manager.once(
        manager.filters.StrategyDeployed(),
        (strategy, genericExecutor) => {
          assert.equal(strategy, stratAddress);
          assert.equal(genericExecutor, executor.address);
        }
      );
      await expect(manager.deployStrategy(executor.address)).to.not.be.reverted;
      strategy = await ethers.getContractAt("Strategy", stratAddress);
      const stratOwner = await strategy.owner();
      assert.equal(stratOwner, manager.address);
    });
  });

  describe.only("Fund Strategy", async () => {
    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      await expect(
        manager.connect(nonOwner).fundStrategy(strategy.address, [
          [
            ethers.utils.formatBytes32String("daiPool"),
            ethers.utils.formatBytes32String("usdcPool"),
            ethers.utils.formatBytes32String("usdtPool"),
          ],
          ["10", "10", "10"],
        ])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Unregistered pool fails", async () => {
      await expect(
        manager.fundStrategy(strategy.address, [
          [
            ethers.utils.formatBytes32String("daiPool"),
            ethers.utils.formatBytes32String("invalidPoolId"),
            ethers.utils.formatBytes32String("usdtPool"),
          ],
          ["10", "10", "10"],
        ])
      ).to.be.revertedWith("Missing address");
    });

    it("Owner can call", async () => {
      const amount = tokenAmountToBigNumber("10", "18");
      await expect(
        manager
          .connect(managerDeployer)
          .fundStrategy(strategy.address, [
            [ethers.utils.formatBytes32String("daiPool")],
            [amount],
          ])
      ).to.not.be.reverted;
    });

    it("Owner can call", async () => {
      const daiToken = await ethers.getContractAt(
        legos.maker.abis.DAI,
        legos.maker.addresses.DAI
      );
      const usdcToken = await ethers.getContractAt(
        legos.centre.abis.USDC_Logic,
        legos.centre.addresses.USDC
      );
      const usdtToken = await ethers.getContractAt(
        legos.tether.abis.USDT,
        legos.tether.addresses.USDT
      );

      // ETHERS contract.on() event listener doesnt seems to be working for some reason.
      // It might be because the event is not at the top most level

      // pre-conditions
      expect(await mApt.balanceOf(apyDaiPool.address)).to.equal("0");
      expect(await mApt.balanceOf(usdcToken.address)).to.equal("0");
      expect(await mApt.balanceOf(usdtToken.address)).to.equal("0");

      expect(await daiToken.balanceOf(strategy.address)).to.equal(0);
      expect(await usdcToken.balanceOf(strategy.address)).to.equal(0);
      expect(await usdtToken.balanceOf(strategy.address)).to.equal(0);

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [manager.address],
      });
      const managerSigner = await ethers.provider.getSigner(manager.address);
      await mApt
        .connect(managerSigner)
        .mint(deployer.address, tokenAmountToBigNumber("100"));

      // start the tests

      const daiPoolBalance = await daiToken.balanceOf(apyDaiPool.address);
      const usdcPoolBalance = await usdcToken.balanceOf(apyUsdcPool.address);
      const usdtPoolBalance = await usdtToken.balanceOf(apyUsdtPool.address);

      const daiAmount = tokenAmountToBigNumber("10", "18");
      const usdcAmount = tokenAmountToBigNumber("10", "6");
      const usdtAmount = tokenAmountToBigNumber("10", "6");

      const tokenEthPrice = await apyDaiPool.getTokenEthPrice();
      const decimals = await daiToken.decimals();
      const mintAmount = await mApt.calculateMintAmount(
        daiAmount,
        tokenEthPrice,
        decimals
      );

      await manager.fundStrategy(strategy.address, [
        [
          ethers.utils.formatBytes32String("daiPool"),
          ethers.utils.formatBytes32String("usdcPool"),
          ethers.utils.formatBytes32String("usdtPool"),
        ],
        [
          daiAmount, //
          usdcAmount, //
          usdtAmount, //
        ],
      ]);

      const stratDaiBalance = await daiToken.balanceOf(strategy.address);
      const stratUsdcBalance = await usdcToken.balanceOf(strategy.address);
      const stratUsdtBalance = await usdtToken.balanceOf(strategy.address);

      expect(stratDaiBalance).to.equal(daiAmount);
      expect(stratUsdcBalance).to.equal(usdcAmount);
      expect(stratUsdtBalance).to.equal(usdtAmount);

      expect(await daiToken.balanceOf(apyDaiPool.address)).to.equal(
        daiPoolBalance.sub(daiAmount)
      );
      expect(await usdcToken.balanceOf(apyUsdcPool.address)).to.equal(
        usdcPoolBalance.sub(usdcAmount)
      );
      expect(await usdtToken.balanceOf(apyUsdtPool.address)).to.equal(
        usdtPoolBalance.sub(usdtAmount)
      );

      console.log(mintAmount.toString());
      expect(await mApt.balanceOf(apyDaiPool.address)).to.equal(mintAmount);
    });
  });

  describe("Fund and Execute", async () => {
    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      await expect(
        manager
          .connect(nonOwner)
          .fundAndExecute(
            strategy.address,
            [[ethers.utils.formatBytes32String("daiPool")], ["100"]],
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
          strategy.address,
          [[ethers.utils.formatBytes32String("invalidPool")], ["100"]],
          [
            [
              "0x6B175474E89094C44Da98b954EedeAC495271d0F",
              "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
            ],
          ]
        )
      ).to.be.revertedWith("Missing address");
    });

    it("Owner can call", async () => {
      const DAI_Contract = await ethers.getContractAt(
        legos.maker.abis.DAI,
        legos.maker.addresses.DAI
      );
      const USDC_Contract = await ethers.getContractAt(
        legos.centre.abis.USDC_Logic,
        legos.centre.addresses.USDC
      );
      const USDT_Contract = await ethers.getContractAt(
        legos.tether.abis.USDT,
        legos.tether.addresses.USDT
      );
      await manager.fundAndExecute(
        strategy.address,
        [[ethers.utils.formatBytes32String("daiPool")], ["100"]],
        [
          [
            "0x6B175474E89094C44Da98b954EedeAC495271d0F",
            "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
          ],
        ]
      );
      const stratDaiBal = await DAI_Contract.balanceOf(strategy.address);
      const stratUsdcBal = await USDC_Contract.balanceOf(strategy.address);
      const stratUsdtBal = await USDT_Contract.balanceOf(strategy.address);

      // NOTE: DAI, USDC, and USDT funded to the account before with 10
      assert.equal(stratDaiBal.toString(), "110");
      assert.equal(stratUsdcBal.toString(), "10");
      assert.equal(stratUsdtBal.toString(), "10");
    });
  });

  describe("Execute", async () => {
    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      // sequence is to give approval to DAI and cDAI @ 100 each
      await expect(
        manager
          .connect(nonOwner)
          .execute(strategy.address, [
            [
              "0x6B175474E89094C44Da98b954EedeAC495271d0F",
              "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
            ],
          ])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Owner can call", async () => {
      const DAI_Contract = await ethers.getContractAt(
        legos.maker.abis.DAI,
        legos.maker.addresses.DAI
      );

      // sequence is to give approval to DAI and cDAI @ 100 each
      await manager.execute(strategy.address, [
        [
          "0x6B175474E89094C44Da98b954EedeAC495271d0F",
          "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
        ],
      ]);

      const daiAllowance = await DAI_Contract.allowance(
        strategy.address,
        legos.apy.addresses.APY_MANAGER
      );

      assert.equal(daiAllowance.toString(), "100");
    });
  });

  describe("Execute and Withdraw", async () => {
    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      await expect(
        manager
          .connect(nonOwner)
          .executeAndWithdraw(
            strategy.address,
            [[ethers.utils.formatBytes32String("daiPool")], ["100"]],
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
        manager.executeAndWithdraw(
          strategy.address,
          [[ethers.utils.formatBytes32String("invalidPool")], ["100"]],
          [
            [
              "0x6B175474E89094C44Da98b954EedeAC495271d0F",
              "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
            ],
          ]
        )
      ).to.be.revertedWith("Missing address");
    });

    it("Owner can call", async () => {
      const DAI_Contract = await ethers.getContractAt(
        legos.maker.abis.DAI,
        legos.maker.addresses.DAI
      );

      await manager.executeAndWithdraw(
        strategy.address,
        [[ethers.utils.formatBytes32String("daiPool")], ["10"]],
        [
          [
            "0x6B175474E89094C44Da98b954EedeAC495271d0F",
            "0x095ea7b3000000000000000000000000fed91f1f9d7dca3e6e4a4b83cef1b14380abde790000000000000000000000000000000000000000000000000000000000000064",
          ],
        ]
      );
      const stratDaiBal = await DAI_Contract.balanceOf(strategy.address);

      // NOTE: DAI, USDC, and USDT funded to the account before with 10
      assert.equal(stratDaiBal.toString(), "100");
    });
  });

  describe("Withdraw from Strategy", async () => {
    it("Non-owner cannot call", async () => {
      const nonOwner = await ethers.provider.getSigner(randomAccount.address);
      await expect(
        manager.connect(nonOwner).withdrawFromStrategy(strategy.address, [
          [
            ethers.utils.formatBytes32String("daiPool"),
            ethers.utils.formatBytes32String("usdcPool"),
            ethers.utils.formatBytes32String("usdtPool"),
          ],
          ["10", "10", "10"],
        ])
      ).to.be.revertedWith("revert Ownable: caller is not the owner");
    });

    it("Unregistered pool fails", async () => {
      await expect(
        manager.withdrawFromStrategy(strategy.address, [
          [ethers.utils.formatBytes32String("invalidPool")],
          ["10"],
        ])
      ).to.be.revertedWith("Missing address");
    });

    it("Owner can call", async () => {
      const DAI_Contract = await ethers.getContractAt(
        legos.maker.abis.DAI,
        legos.maker.addresses.DAI
      );

      // ETHERS contract.on() event listener doesnt seems to be working for some reason.
      // It might be because the event is not at the top most level

      await manager.withdrawFromStrategy(strategy.address, [
        [ethers.utils.formatBytes32String("daiPool")],
        ["10"],
      ]);

      const stratDaiBal = await DAI_Contract.balanceOf(strategy.address);
      assert.equal(stratDaiBal.toString(), "90");
    });
  });
});
