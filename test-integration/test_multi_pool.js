const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const {
  BN,
  ether,
  balance,
  send,
  constants,
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYLiquidityPoolProxy = artifacts.require("APYLiquidityPoolProxy");
const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplementation"
);
const IERC20 = artifacts.require("IERC20");
const IMintableERC20 = artifacts.require("IMintableERC20");
const {
  DAI_ADDRESS,
  DAI_MINTER_ADDRESS,
  USDT_ADDRESS,
  USDC_ADDRESS,
} = require("../utils/constants");
const {
  erc20,
  dai,
  mintERC20Tokens,
  getERC20Balance,
  undoErc20,
} = require("../utils/helpers");

contract("APYLiquidityPool", async (accounts) => {
  const [owner, admin, wallet, other] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;
  let pool;

  let daiToken;
  let tetherToken;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    proxyAdmin = await ProxyAdmin.new({ from: owner });
    logic = await APYLiquidityPoolImplementation.new({ from: owner });
    proxy = await APYLiquidityPoolProxy.new(logic.address, proxyAdmin.address, {
      from: owner,
    });
    pool = await APYLiquidityPoolImplementation.at(proxy.address);

    daiToken = await IMintableERC20.at(DAI_ADDRESS);
    await mintERC20Tokens(
      DAI_ADDRESS,
      pool.address,
      DAI_MINTER_ADDRESS,
      dai("10000")
    );

    const TETHER_TREASURY_ADDRESS =
      "0xC6CDE7C39eB2f0F0095F41570af89eFC2C1Ea828";
    tetherToken = await IERC20.at(USDT_ADDRESS);
    await tetherToken.transfer(pool.address, erc20("100", "6"), {
      from: TETHER_TREASURY_ADDRESS,
    });
    await tetherToken.transfer(wallet, erc20("100", "6"), {
      from: TETHER_TREASURY_ADDRESS,
    });
  });

  it.only("getTotalEthValue", async () => {
    expect(await pool.getTotalEthValue()).to.be.bignumber.gt("0");
    console.log(
      "total ETH value:",
      (await pool.getTotalEthValue()).toString() / 1e18
    );

    let result = await pool.getTokenEthPrice(daiToken.address);
    console.log(
      "DAI/ETH price, decimals",
      result[0].toString(),
      result[1].toString()
    );
    result = await pool.getTokenEthPrice(USDT_ADDRESS);
    console.log(
      "USDT/ETH price, decimals",
      result[0].toString(),
      result[1].toString()
    );
    result = await pool.getTokenEthPrice(USDC_ADDRESS);
    console.log(
      "USDC/ETH price, decimals",
      result[0].toString(),
      result[1].toString()
    );
  });

  it.only("addLiquidity for multiple tokens", async () => {
    console.log(
      "Tether balance:",
      (await tetherToken.balanceOf(pool.address)).toString() / 1e6
    );
    console.log(
      "DAI balance:",
      (await daiToken.balanceOf(pool.address)).toString() / 1e18
    );

    await tetherToken.approve(pool.address, erc20("10", "6"), { from: wallet });
    await pool.addLiquidity(erc20("10", "6"), tetherToken.address, {
      from: wallet,
    });

    console.log("");
  });
});
