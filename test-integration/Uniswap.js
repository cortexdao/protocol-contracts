const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  acquireToken,
  MAX_UINT256,
} = require("../utils/helpers");
const { STABLECOIN_POOLS } = require("../utils/constants");

const IUniswapV2Pair = artifacts.require("IUniswapV2Pair");
const IUniswapV2Router = artifacts.require("IUniswapV2Router");

const UNISWAP_V2_ROUTER_ADDRESS = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
// USDC-USDT pair
const LP_TOKEN_ADDRESS = "0x3041cbd36888becc7bbcbc0045e3b1f144466f5f";

describe("Contract: UniswapPeriphery", () => {
  // signers
  let deployer;
  let strategy;

  // contract factories
  let UniswapPeriphery;

  // deployed contracts
  let uniswap;

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
    [deployer, strategy] = await ethers.getSigners();
    UniswapPeriphery = await ethers.getContractFactory("UniswapPeriphery");
    uniswap = await UniswapPeriphery.deploy();
    await uniswap.deployed();
  });

  describe("getUnderlyerBalance", () => {
    let router;
    let lpToken;

    const tokenIndex = 0; // USDC
    let token_0;
    let token_1;

    beforeEach(async () => {
      lpToken = await ethers.getContractAt(
        IUniswapV2Pair.abi,
        LP_TOKEN_ADDRESS
      );
      router = await ethers.getContractAt(
        IUniswapV2Router.abi,
        UNISWAP_V2_ROUTER_ADDRESS
      );

      // USDC
      const tokenAddress_0 = await lpToken.token0();
      token_0 = await ethers.getContractAt("IDetailedERC20", tokenAddress_0);
      // USDT (Tether)
      const tokenAddress_1 = await lpToken.token1();
      token_1 = await ethers.getContractAt("IDetailedERC20", tokenAddress_1);

      for (const token of [token_0, token_1]) {
        const decimals = await token.decimals();
        const amount = tokenAmountToBigNumber("10000", decimals);
        const symbol = await token.symbol();
        const sender = STABLECOIN_POOLS[symbol];
        await acquireToken(sender, strategy, token, amount, deployer);
      }
    });

    it("Get underlyer balance from account holding", async () => {
      const amountDesired_0 = tokenAmountToBigNumber("1000", 6);
      const amountDesired_1 = tokenAmountToBigNumber("1000", 6);
      const amountMin_0 = 1;
      const amountMin_1 = 1;
      await token_0.connect(strategy).approve(router.address, MAX_UINT256);
      await token_1.connect(strategy).approve(router.address, MAX_UINT256);
      await router
        .connect(strategy)
        .addLiquidity(
          token_0.address,
          token_1.address,
          amountDesired_0,
          amountDesired_1,
          amountMin_0,
          amountMin_1,
          strategy.address,
          MAX_UINT256
        );

      const strategyLpBalance = await lpToken.balanceOf(strategy.address);
      const lpTotalSupply = await lpToken.totalSupply();
      const poolBalance = await token_0.balanceOf(lpToken.address);

      const expectedBalance = strategyLpBalance
        .mul(poolBalance)
        .div(lpTotalSupply);
      expect(expectedBalance).to.be.gt(0);

      const balance = await uniswap.getUnderlyerBalance(
        strategy.address,
        lpToken.address,
        tokenIndex
      );
      expect(balance).to.equal(expectedBalance);
    });
  });
});
