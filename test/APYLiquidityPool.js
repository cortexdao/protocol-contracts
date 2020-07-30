const { expect } = require("chai");
const { utils } = require("ethers");
const {
  solidity,
  createFixtureLoader,
  deployContract,
} = require("ethereum-waffle");
const APYLiquidityPool = require("../artifacts/APYLiquidityPool.json");
const APT = require("../artifacts/APT.json");
const { deployMockContract } = require("@ethereum-waffle/mock-contract");

describe("APYLiquidityPool", () => {
  const provider = waffle.provider;
  const [wallet] = provider.getWallets();

  let apiLiquidityPool;
  let apt;

  beforeEach(async () => {
    apiLiquidityPool = await deployContract(wallet, APYLiquidityPool);
    apt = await deployContract(wallet, APT);
    await apiLiquidityPool.setTokenContract(apt.address);
  });

  it("mint receives ETH value sent", async () => {
    const balance_1 = await provider.getBalance(apiLiquidityPool.address);
    expect(balance_1).to.be.eq(0);

    const etherSent = utils.parseEther("1");
    await apiLiquidityPool.mint({ value: etherSent });

    const balance_2 = await provider.getBalance(apiLiquidityPool.address);
    expect(balance_2).to.be.eq(etherSent);
  });

  it("mint reverts if 0 ETH sent", async () => {
    await expect(apiLiquidityPool.mint({ value: "0" })).to.be.reverted;
  });

  it("mint amount to supply equals ETH deposit to total ETH value", async () => {
    // start with non-zero token supply and non-zero ETH value
    apt = await deployMockContract(wallet, APT.abi);
    await apiLiquidityPool.setTokenContract(apt.address);
    await apt.mock.totalSupply.returns(utils.parseEther("100"));

    const ethValue = utils.parseEther("10");
    const totalValue = utils.parseEther("100");
    const mintAmount = await apiLiquidityPool._calculateMintAmount(
      ethValue,
      totalValue
    );
    expect(mintAmount - ethValue).to.be.lt(1e-18);
  });

  it("mint amount is constant multiple of deposit if total ETH value is zero", async () => {
    // start with zero total ETH value and non-zero total supply
  });

  it("mint amount is constant multiple of deposit if total supply is zero ", async () => {
    // start with non-zero total ETH value and zero total supply
  });
});
