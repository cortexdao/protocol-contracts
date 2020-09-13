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
const ERC20 = artifacts.require("ERC20UpgradeSafe");
const IMintableERC20 = artifacts.require("IMintableERC20");
const {
  DAI_ADDRESS,
  DAI_MINTER_ADDRESS,
  USDT_ADDRESS,
  USDC_ADDRESS,
  USDC_WHALE_ADDRESS,
} = require("../utils/constants");
const {
  erc20,
  dai,
  mintERC20Tokens,
  getERC20Balance,
  undoErc20,
} = require("../utils/helpers");

const tether = (amount) => {
  return erc20(amount, "6");
};

const usdc = (amount) => {
  return erc20(amount, "6");
};

contract("APYLiquidityPool", async (accounts) => {
  const [owner, admin, wallet, other] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;
  let pool;

  let daiToken;
  let tetherToken;
  let usdcToken;
  let apt;

  // use EVM snapshots for test isolation
  let snapshotId;

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
    tetherToken = await ERC20.at(USDT_ADDRESS);
    usdcToken = await ERC20.at(USDC_ADDRESS);

    apt = pool;
  });

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];

    await mintERC20Tokens(
      DAI_ADDRESS,
      wallet,
      DAI_MINTER_ADDRESS,
      dai("10000")
    );

    const TETHER_TREASURY_ADDRESS =
      "0xC6CDE7C39eB2f0F0095F41570af89eFC2C1Ea828";
    await tetherToken.transfer(wallet, tether("10000"), {
      from: TETHER_TREASURY_ADDRESS,
      gasPrice: 0,
    });

    console.log(
      "USDC Whale balance:",
      (await usdcToken.balanceOf(USDC_WHALE_ADDRESS)).toString() / 1e6
    );
    await usdcToken.transfer(wallet, usdc("10000"), {
      from: USDC_WHALE_ADDRESS,
      gasPrice: 0,
    });

    await tetherToken.approve(pool.address, tether("10000"), { from: wallet });
    await daiToken.approve(pool.address, dai("10000"), { from: wallet });
    await usdcToken.approve(pool.address, usdc("10000"), { from: wallet });

    await pool.addTokenSupport(
      USDT_ADDRESS,
      "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46"
    );
    await pool.addTokenSupport(
      USDC_ADDRESS,
      "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4"
    );
    await pool.addTokenSupport(
      DAI_ADDRESS,
      "0x773616E4d11A78F511299002da57A0a94577F1f4"
    );
  });

  it.only("getPoolTotalEthValue", async () => {
    // expect(await pool.getPoolTotalEthValue()).to.be.bignumber.gt("0");
    console.log(
      "total ETH value:",
      (await pool.getPoolTotalEthValue()).toString() / 1e18
    );

    let result = await pool.getTokenEthPrice(daiToken.address);
    console.log("DAI/ETH price", result.toString());
    result = await pool.getTokenEthPrice(USDT_ADDRESS);
    console.log("USDT/ETH price", result.toString());
    result = await pool.getTokenEthPrice(USDC_ADDRESS);
    console.log("USDC/ETH price", result.toString());
  });

  it.only("addLiquidity for multiple tokens", async () => {
    console.log(
      "Tether balance:",
      (await tetherToken.balanceOf(wallet)).toString() / 1e6
    );
    console.log(
      "DAI balance:",
      (await daiToken.balanceOf(wallet)).toString() / 1e18
    );
    console.log(
      "USDC balance:",
      (await usdcToken.balanceOf(wallet)).toString() / 1e6
    );

    const tetherAmount = tether("10");
    await pool.addLiquidityV2(tetherAmount, tetherToken.address, {
      from: wallet,
    });

    console.log("Wallet:");
    await getERC20Balance(apt.address, wallet);

    console.log("Pool token balances:");
    await getERC20Balance(daiToken.address, pool.address);
    await getERC20Balance(tetherToken.address, pool.address);
    await getERC20Balance(usdcToken.address, pool.address);

    console.log("");
    console.log("APT supply:", (await apt.totalSupply()).toString() / 1e18);
    console.log(
      "Total ETH value:",
      (await pool.getPoolTotalEthValue()).toString() / 1e18
    );
    console.log("");

    const daiAmount = dai("10");
    await pool.addLiquidityV2(daiAmount, daiToken.address, {
      from: wallet,
    });

    console.log("Wallet:");
    await getERC20Balance(apt.address, wallet);

    console.log("Pool token balances:");
    await getERC20Balance(daiToken.address, pool.address);
    await getERC20Balance(tetherToken.address, pool.address);
    await getERC20Balance(usdcToken.address, pool.address);

    console.log("");
    console.log("APT supply:", (await apt.totalSupply()).toString() / 1e18);
    console.log(
      "Total ETH value:",
      (await pool.getPoolTotalEthValue()).toString() / 1e18
    );

    console.log("");
    const usdcAmount = usdc("10");
    await pool.addLiquidityV2(usdcAmount, usdcToken.address, {
      from: wallet,
    });

    console.log("Wallet:");
    await getERC20Balance(apt.address, wallet);

    console.log("Pool token balances:");
    await getERC20Balance(daiToken.address, pool.address);
    await getERC20Balance(tetherToken.address, pool.address);
    await getERC20Balance(usdcToken.address, pool.address);

    console.log("");
    console.log("APT supply:", (await apt.totalSupply()).toString() / 1e18);
    console.log(
      "Total ETH value:",
      (await pool.getPoolTotalEthValue()).toString() / 1e18
    );
    console.log("");

    const daiEthValue = await pool.getTokenBalanceEthValue(
      pool.address,
      daiToken.address
    );
    const tetherEthValue = await pool.getTokenBalanceEthValue(
      pool.address,
      tetherToken.address
    );
    const usdcEthValue = await pool.getTokenBalanceEthValue(
      pool.address,
      usdcToken.address
    );
    console.log("Pool ether value breakdown:");
    console.log("DAI", daiEthValue.toString() / 1e18);
    console.log("Tether", tetherEthValue.toString() / 1e18);
    console.log("USDC", usdcEthValue.toString() / 1e18);

    // console.log("DAI decimals:", (await daiToken.decimals()).toString());
    // console.log("Tether decimals:", (await tetherToken.decimals()).toString());
  });

  it.only("redeem for multiple tokens", async () => {
    console.log(
      "Tether balance:",
      (await tetherToken.balanceOf(wallet)).toString() / 1e6
    );
    console.log(
      "DAI balance:",
      (await daiToken.balanceOf(wallet)).toString() / 1e18
    );
    console.log(
      "USDC balance:",
      (await usdcToken.balanceOf(wallet)).toString() / 1e6
    );

    const tetherAmount = tether("10");
    await pool.addLiquidityV2(tetherAmount, tetherToken.address, {
      from: wallet,
    });

    const daiAmount = dai("10");
    await pool.addLiquidityV2(daiAmount, daiToken.address, {
      from: wallet,
    });

    const usdcAmount = usdc("10");
    await pool.addLiquidityV2(usdcAmount, usdcToken.address, {
      from: wallet,
    });

    await pool.redeemV2(erc20("22", "18"), usdcToken.address, { from: wallet });

    console.log("Wallet:");
    await getERC20Balance(apt.address, wallet);

    console.log("Pool token balances:");
    await getERC20Balance(daiToken.address, pool.address);
    await getERC20Balance(tetherToken.address, pool.address);
    await getERC20Balance(usdcToken.address, pool.address);

    console.log("");
    console.log("APT supply:", (await apt.totalSupply()).toString() / 1e18);
    console.log(
      "Total ETH value:",
      (await pool.getPoolTotalEthValue()).toString() / 1e18
    );
    console.log("");

    const daiEthValue = await pool.getTokenBalanceEthValue(
      pool.address,
      daiToken.address
    );
    const tetherEthValue = await pool.getTokenBalanceEthValue(
      pool.address,
      tetherToken.address
    );
    const usdcEthValue = await pool.getTokenBalanceEthValue(
      pool.address,
      usdcToken.address
    );
    console.log("Pool ether value breakdown:");
    console.log("DAI", daiEthValue.toString() / 1e18);
    console.log("Tether", tetherEthValue.toString() / 1e18);
    console.log("USDC", usdcEthValue.toString() / 1e18);
  });
});
