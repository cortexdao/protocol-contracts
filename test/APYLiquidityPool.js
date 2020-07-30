const { use, expect } = require("chai");
const { utils } = require("ethers");
const { deployContract } = require("ethereum-waffle");
const { waffleChai } = require("@ethereum-waffle/chai");
const APYLiquidityPool = require("../artifacts/APYLiquidityPool.json");
const APT = require("../artifacts/APT.json");
const { deployMockContract } = require("@ethereum-waffle/mock-contract");
const { BigNumber } = require("ethers/utils");

describe("APYLiquidityPool", () => {
  const provider = waffle.provider;
  const [wallet] = provider.getWallets();

  let apyLiquidityPool;
  let apt;

  const DEFAULT_TOKEN_TO_ETH_FACTOR = new BigNumber("1000");

  beforeEach(async () => {
    apyLiquidityPool = await deployContract(wallet, APYLiquidityPool);
    apt = await deployContract(wallet, APT);
    await apyLiquidityPool.setTokenAddress(apt.address);
    await apt.setManagerAddress(apyLiquidityPool.address);
  });

  it("mint receives ETH value sent", async () => {
    const balance_1 = await provider.getBalance(apyLiquidityPool.address);
    expect(balance_1).to.be.eq(0);

    const etherSent = utils.parseEther("1");
    await apyLiquidityPool.mint({ value: etherSent });

    const balance_2 = await provider.getBalance(apyLiquidityPool.address);
    expect(balance_2).to.be.eq(etherSent);
  });

  it("mint reverts if 0 ETH sent", async () => {
    await expect(apyLiquidityPool.mint({ value: "0" })).to.be.reverted;
  });

  it("mint amount to supply equals ETH deposit to total ETH value", async () => {
    const ethValue = utils.parseEther("112");
    const totalValue = utils.parseEther("1000000");
    // mock token and set total supply to total ETH value
    apt = await deployMockContract(wallet, APT.abi);
    await apyLiquidityPool.setTokenAddress(apt.address);
    await apt.mock.totalSupply.returns(totalValue);

    let mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      totalValue
    );
    let expectedAmount = ethValue;
    expect(Math.abs(mintAmount.sub(expectedAmount))).to.be.lte(
      1,
      "mint amount should differ by at most a wei from expected amount"
    );

    await apt.mock.totalSupply.returns(totalValue.div(2));

    mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      totalValue
    );
    expectedAmount = ethValue.div(2);
    expect(Math.abs(mintAmount.sub(expectedAmount))).to.be.lte(
      1,
      "mint amount should differ by at most a wei from expected amount"
    );
  });

  it("mint amount is constant multiple of deposit if total ETH value is zero", async () => {
    // mock out token contract and set non-zero total supply
    apt = await deployMockContract(wallet, APT.abi);
    await apyLiquidityPool.setTokenAddress(apt.address);
    await apt.mock.totalSupply.returns(utils.parseEther("100"));

    const ethValue = utils.parseEther("7.3");
    const mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      0
    );
    expect(mintAmount).to.equal(ethValue.mul(DEFAULT_TOKEN_TO_ETH_FACTOR));
  });

  it("mint amount is constant multiple of deposit if total supply is zero ", async () => {
    const ethValue = utils.parseEther("5");
    const totalValue = utils.parseEther("100");
    const mintAmount = await apyLiquidityPool.internalCalculateMintAmount(
      ethValue,
      totalValue
    );
    expect(mintAmount).to.equal(ethValue.mul(DEFAULT_TOKEN_TO_ETH_FACTOR));
  });

  it("mint will create tokens for sender", async () => {
    let balanceOf = await apt.balanceOf(wallet.address);
    expect(balanceOf).to.equal(0);

    await apyLiquidityPool.mint({ value: utils.parseEther("1") });
    balanceOf = await apt.balanceOf(wallet.address);
    expect(balanceOf).to.be.gt(0);
  });
});
