require("dotenv").config();
const {
  //assert,
  expect,
} = require("chai");
const { artifacts, contract, ethers, network, web3 } = require("hardhat");
const { constants } = require("@openzeppelin/test-helpers");
const { MAX_UINT256, ZERO_ADDRESS } = constants;
const {
  console,
  erc20,
} = require("../utils/helpers");
const legos = require("@apy-finance/defi-legos");

const APYManagerV2 = artifacts.require("APYManagerV2");
const APYPoolTokenV2 = artifacts.require("APYPoolTokenV2");

const POOL_MNEMONIC = process.env.POOL_MNEMONIC
const MANAGER_MNEMONIC = process.env.MANAGER_MNEMONIC

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

contract("APYManager", async (accounts) => {
  const [deployer] = accounts;

  let manager;
  let usdcPool;
  let usdcToken;
  let mApt;

  before(async () => {
    const provider = new ethers.providers.InfuraProvider(1, process.env.INFURA_API_KEY)
    let pool_wallet = new ethers.Wallet.fromMnemonic(POOL_MNEMONIC)
    let manager_wallet = new ethers.Wallet.fromMnemonic(MANAGER_MNEMONIC)

    pool_wallet = pool_wallet.connect(provider)
    manager_wallet = manager_wallet.connect(provider)

    await web3.eth.sendTransaction({
      from: deployer,
      to: pool_wallet.address,
      value: 10e18,
    })

    await web3.eth.sendTransaction({
      from: deployer,
      to: manager_wallet.address,
      value: 10e18,
    })


    console.log(provider)
    console.log(pool_wallet.address)
    console.log(manager_wallet.address)

    // upgrade pools
    const newPoolLogic = await ethers.getContractFactory("APYPoolTokenV2");
    const newPoolLogicContract = await newPoolLogic.deploy();
    const PoolAdmin = await ethers.getContractAt(
      legos.apy.abis.APY_POOL_Admin,
      legos.apy.addresses.APY_POOL_Admin,
      pool_wallet
    );
    await PoolAdmin.upgrade(
      legos.apy.addresses.APY_DAI_POOL,
      newPoolLogicContract.address,
    );

    process.exit(0)

    await PoolAdmin.upgrade(
      legos.apy.addresses.APY_USDC_POOL,
      newPoolLogicContract.address,
      { from: pool_wallet }
    );
    await PoolAdmin.upgrade(
      legos.apy.addresses.APY_USDT_POOL,
      newPoolLogicContract.address,
      { from: pool_wallet }
    );

    // upgrade manager
    const newManagerLogic = await ethers.getContractFactory("APYManagerV2")
    const newManagerLogicContract = await newManagerLogic.deploy()
    const ManagerAdmin = await ethers.getContractAt(APYManagerV2.abi, legos.apy.addresses.APY_MANAGER_Admin)
    ManagerAdmin.upgrade(legos.apy.addresses.APY_MANAGER, newManagerLogicContract.address, { from: MANAGER_DEPLOYER })

    //handle approvals
    const APY_DAI_POOL = await ethers.getContractAt(
      APYPoolTokenV2.abi,
      legos.apy.addresses.APY_DAI_POOL
    );
    const APY_USDC_POOL = await ethers.getContractAt(
      APYPoolTokenV2.abi,
      legos.apy.addresses.APY_USDC_POOL
    );
    const APY_USDT_POOL = await ethers.getContractAt(
      APYPoolTokenV2.abi,
      legos.apy.addresses.APY_USDT_POOL
    );

    APY_DAI_POOL.infiniteApprove(
      legos.apy.addresses.APY_MANAGER,
      { from: MANAGER_DEPLOYER }
    )
    APY_USDC_POOL.infiniteApprove(
      legos.apy.addresses.APY_MANAGER,
      { from: MANAGER_DEPLOYER }
    )
    APY_USDT_POOL.infiniteApprove(
      legos.apy.addresses.APY_MANAGER,
      { from: MANAGER_DEPLOYER }
    );
  });

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
