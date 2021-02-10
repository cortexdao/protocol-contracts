require("dotenv").config();
const {
  assert,
} = require("chai");
const { artifacts, contract, ethers, network, web3 } = require("hardhat");
const { constants, expectRevert, expectEvent } = require("@openzeppelin/test-helpers");
const { MAX_UINT256, ZERO_ADDRESS } = constants;
const {
  console,
  erc20,
} = require("../utils/helpers");
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
  const [_, account1, account2] = accounts;

  let APY_DAI_POOL;
  let APY_USDC_POOL;
  let APY_USDT_POOL;
  let Manager;
  let executor;
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
    ManagerAdmin.upgrade(
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

    APY_DAI_POOL.infiniteApprove(
      legos.apy.addresses.APY_MANAGER
    )
    APY_USDC_POOL.infiniteApprove(
      legos.apy.addresses.APY_MANAGER
    )
    APY_USDT_POOL.infiniteApprove(
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
      await Manager.deployStrategy(executor.address)
      // ethers has trouble detecting the events, so I'm checking that the contract exists by checking the owner
      const strat = await ethers.getContractAt(Strategy.abi, stratAddress)
      const stratOwner = await strat.owner()
      assert.equal(stratOwner, Manager.address)
    })
  })

  describe.only("Execute", async () => {
    it("Test Execute by non owner", async () => {
    })

    it("Test Execute by owner", async () => {
    })
  })

  describe.only("fundAndExecute", async () => {
    it("Test fundAndExecute by non owner", async () => {
    })

    it("Test fundAndExecute by owner", async () => {
    })
  })
});
