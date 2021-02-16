require("dotenv").config();
const { assert } = require("chai");
const { artifacts, contract, ethers, network, web3 } = require("hardhat");
const { expectRevert } = require("@openzeppelin/test-helpers");
const legos = require("@apy-finance/defi-legos");

const APYManagerV2 = artifacts.require("APYManagerV2");
const APYPoolTokenV2 = artifacts.require("APYPoolTokenV2");
const Strategy = artifacts.require("Strategy");

const POOL_DEPLOYER = '0x6EAF0ab3455787bA10089800dB91F11fDf6370BE'
const MANAGER_DEPLOYER = '0x0f7B66a4a3f7CfeAc2517c2fb9F0518D48457d41'

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

contract("APYManager", async (accounts) => {
  // I use hardhat to be able switch between accounts with impersonateAcccount functionality
  // ENABLE_FORKING=true yarn hardhat node
  // yarn test:integration --network localhost

  const [_, account1, account2] = accounts;

  let APY_DAI_POOL;
  let APY_USDC_POOL;
  let APY_USDT_POOL;
  let Manager;
  let executor;
  let strategy;
  let mApt;
  let signer

  before(async () => {
    // Fund Deployers
    await web3.eth.sendTransaction({
      from: _,
      to: POOL_DEPLOYER,
      value: 10e18,
    })

    await web3.eth.sendTransaction({
      from: _,
      to: MANAGER_DEPLOYER,
      value: 10e18,
    })

    // Impersonate
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [POOL_DEPLOYER],
    });

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [MANAGER_DEPLOYER],
    });

    // Upgrade pools
    signer = await ethers.provider.getSigner(POOL_DEPLOYER)
    const newPoolLogic = await ethers.getContractFactory("APYPoolTokenV2");
    const newPoolLogicContract = await newPoolLogic.deploy();
    const PoolAdmin = await ethers.getContractAt(
      legos.apy.abis.APY_POOL_Admin,
      legos.apy.addresses.APY_POOL_Admin,
      signer
    );

    await PoolAdmin.upgrade(
      legos.apy.addresses.APY_DAI_POOL,
      newPoolLogicContract.address,
    );
    await PoolAdmin.upgrade(
      legos.apy.addresses.APY_USDC_POOL,
      newPoolLogicContract.address,
    );
    await PoolAdmin.upgrade(
      legos.apy.addresses.APY_USDT_POOL,
      newPoolLogicContract.address,
    );

    // Upgrade manager
    signer = await ethers.provider.getSigner(MANAGER_DEPLOYER)
    const newManagerLogic = await ethers.getContractFactory("APYManagerV2")
    const newManagerLogicContract = await newManagerLogic.deploy()
    const ManagerAdmin = await ethers.getContractAt(
      legos.apy.abis.APY_MANAGER_Admin,
      legos.apy.addresses.APY_MANAGER_Admin,
      signer
    )
    await ManagerAdmin.upgrade(
      legos.apy.addresses.APY_MANAGER,
      newManagerLogicContract.address
    )

    //Handle approvals
    signer = await ethers.provider.getSigner(POOL_DEPLOYER)
    APY_DAI_POOL = await ethers.getContractAt(
      APYPoolTokenV2.abi,
      legos.apy.addresses.APY_DAI_POOL,
      signer
    );
    APY_USDC_POOL = await ethers.getContractAt(
      APYPoolTokenV2.abi,
      legos.apy.addresses.APY_USDC_POOL,
      signer
    );
    APY_USDT_POOL = await ethers.getContractAt(
      APYPoolTokenV2.abi,
      legos.apy.addresses.APY_USDT_POOL,
      signer
    );

    await APY_DAI_POOL.infiniteApprove(
      legos.apy.addresses.APY_MANAGER
    )
    await APY_USDC_POOL.infiniteApprove(
      legos.apy.addresses.APY_MANAGER
    )
    await APY_USDT_POOL.infiniteApprove(
      legos.apy.addresses.APY_MANAGER
    );

    // Create Generic Executor
    const ExecutorFactory = await ethers.getContractFactory("APYGenericExecutor")
    executor = await ExecutorFactory.deploy()

    // Set variables
    signer = await ethers.provider.getSigner(MANAGER_DEPLOYER)
    Manager = await ethers.getContractAt(APYManagerV2.abi, legos.apy.addresses.APY_MANAGER, signer)
  });

  describe.only("Deploy Strategy", async () => {
    it("Test Deploying strategy by non owner", async () => {
      const bad_signer = await ethers.provider.getSigner(_)
      const bad_MANAGER = await ethers.getContractAt(APYManagerV2.abi, legos.apy.addresses.APY_MANAGER, bad_signer)
      await expectRevert(bad_MANAGER.deployStrategy(executor.address), "revert Ownable: caller is not the owner")
    })

    it("Test Deploying strategy by owner", async () => {
      const stratAddress = await Manager.callStatic.deployStrategy(executor.address)
      Manager.once(Manager.filters.StrategyDeployed(), (strategy, genericExecutor) => {
        assert.equal(strategy, stratAddress)
        assert.equal(genericExecutor, executor.address)
      })
      await Manager.deployStrategy(executor.address)
      strategy = await ethers.getContractAt(Strategy.abi, stratAddress)
      const stratOwner = await strategy.owner()
      assert.equal(stratOwner, Manager.address)
    })
  })

  describe.only("Fund Strategy", async () => {
    it("Test funding strategy by non owner", async () => {
      const bad_signer = await ethers.provider.getSigner(_)
      const bad_MANAGER = await ethers.getContractAt(APYManagerV2.abi, legos.apy.addresses.APY_MANAGER, bad_signer)
      await expectRevert(bad_MANAGER.fundStrategy(strategy.address,
        [
          [legos.maker.addresses.DAI, legos.centre.addresses.USDC, legos.tether.addresses.USDT],
          ['10', '10', '10']
        ]
      ), "revert Ownable: caller is not the owner")
    })

    it("Test funding strategy by owner", async () => {
      const DAI_Contract = await ethers.getContractAt(legos.maker.abis.DAI, legos.maker.addresses.DAI)
      const USDC_Contract = await ethers.getContractAt(legos.centre.abis.USDC_Logic, legos.centre.addresses.USDC)
      const USDT_Contract = await ethers.getContractAt(legos.tether.abis.USDT, legos.tether.addresses.USDT)

      // ETHERS contract.on() event listener doesnt seems to be working for some reason.
      // It might be because the event is not at the top most level

      await Manager.fundStrategy(strategy.address,
        [
          [legos.apy.addresses.APY_DAI_POOL, legos.apy.addresses.APY_USDC_POOL, legos.apy.addresses.APY_USDT_POOL],
          ['10', '10', '10']
        ]
      )

      const stratDaiBal = await DAI_Contract.balanceOf(strategy.address)
      const stratUsdcBal = await USDC_Contract.balanceOf(strategy.address)
      const stratUsdtBal = await USDT_Contract.balanceOf(strategy.address)

      assert.equal(stratDaiBal.toString(), "10")
      assert.equal(stratUsdcBal.toString(), "10")
      assert.equal(stratUsdtBal.toString(), "10")
    })
  })

  describe.only("Fund and Execute", async () => {
    it("Test fundAndExecute by non owner", async () => {
      const bad_signer = await ethers.provider.getSigner(_)
      const bad_MANAGER = await ethers.getContractAt(APYManagerV2.abi, legos.apy.addresses.APY_MANAGER, bad_signer)

      await expectRevert(bad_MANAGER.fundAndExecute(strategy.address,
        [
          ['0x75CE0E501e2E6776FcAAa514f394a88a772A8970', '0xe18b0365D5D09F394f84eE56ed29DD2d8D6Fba5f'],
          ['100', '140']
        ],
        [
          [
            '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            '0x095ea7b30000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000000000000000000064'
          ],
          [
            '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
            '0x095ea7b30000000000000000000000005d3a536e4d6dbd6114cc1ead35777bab948e36430000000000000000000000000000000000000000000000000000000000000064'
          ]
        ]
      ), "revert Ownable: caller is not the owner")
    })

    it("Test fundAndExecute by owner", async () => {
      const DAI_Contract = await ethers.getContractAt(legos.maker.abis.DAI, legos.maker.addresses.DAI)
      const USDC_Contract = await ethers.getContractAt(legos.centre.abis.USDC_Logic, legos.centre.addresses.USDC)
      const USDT_Contract = await ethers.getContractAt(legos.tether.abis.USDT, legos.tether.addresses.USDT)
      await Manager.fundAndExecute(strategy.address,
        [
          ['0x75CE0E501e2E6776FcAAa514f394a88a772A8970', '0xe18b0365D5D09F394f84eE56ed29DD2d8D6Fba5f'],
          ['100', '140']
        ],
        [
          [
            '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            '0x095ea7b30000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000000000000000000064'
          ],
          [
            '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
            '0x095ea7b30000000000000000000000005d3a536e4d6dbd6114cc1ead35777bab948e36430000000000000000000000000000000000000000000000000000000000000064'
          ]
        ]
      )
      const stratDaiBal = await DAI_Contract.balanceOf(strategy.address)
      const stratUsdcBal = await USDC_Contract.balanceOf(strategy.address)
      const stratUsdtBal = await USDT_Contract.balanceOf(strategy.address)

      // NOTE: DAI, USDC, and USDT funded to the account before with 10
      assert.equal(stratDaiBal.toString(), "110")
      assert.equal(stratUsdcBal.toString(), "150")
      assert.equal(stratUsdtBal.toString(), "10")
    })
  })

  describe.only("Execute", async () => {
    it("Test Execute by non owner", async () => {
      const bad_signer = await ethers.provider.getSigner(_)
      const bad_MANAGER = await ethers.getContractAt(APYManagerV2.abi, legos.apy.addresses.APY_MANAGER, bad_signer)

      // sequence is to give approval to DAI and cDAI @ 100 each
      await expectRevert(bad_MANAGER.execute(strategy.address,
        [
          [
            '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            '0x095ea7b30000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000000000000000000064'
          ],
          [
            '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
            '0x095ea7b30000000000000000000000005d3a536e4d6dbd6114cc1ead35777bab948e36430000000000000000000000000000000000000000000000000000000000000064'
          ]
        ]
      ), "revert Ownable: caller is not the owner")
    })

    it("Test Execute by owner", async () => {
      const DAI_Contract = await ethers.getContractAt(legos.maker.abis.DAI, legos.maker.addresses.DAI)
      const cDAI_Contract = await ethers.getContractAt(legos.compound.abis.cDAI, legos.compound.addresses.cDAI)

      // sequence is to give approval to DAI and cDAI @ 100 each
      await Manager.execute(strategy.address,
        [
          [
            '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            '0x095ea7b30000000000000000000000006b175474e89094c44da98b954eedeac495271d0f0000000000000000000000000000000000000000000000000000000000000064'
          ],
          [
            '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643',
            '0x095ea7b30000000000000000000000005d3a536e4d6dbd6114cc1ead35777bab948e36430000000000000000000000000000000000000000000000000000000000000064'
          ]
        ]
      )

      const daiAllowance = await DAI_Contract.allowance(strategy.address, DAI_Contract.address)
      const cDaiAllowance = await cDAI_Contract.allowance(strategy.address, cDAI_Contract.address)

      assert.equal(daiAllowance.toString(), "100")
      assert.equal(cDaiAllowance.toString(), "100")
    })
  })

  describe.only("Execute and Withdraw", async () => {
    it("Test executeAndWithdraw by non owner", async () => {
    })

    it("Test executeAndWithdraw by owner", async () => {
    })
  })

  describe.only("Withdraw from Strategy", async () => {
    it("Test withdrawing from strategy by non owner", async () => {
    })

    it("Test withdrawing from strategy by owner", async () => {
    })
  })
});
