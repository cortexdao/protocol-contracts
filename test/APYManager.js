const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const {
  BN,
  ether,
  balance,
  send,
  constants,
  expectEvent,
  expectRevert,
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");

const APYManager = artifacts.require("APYManager");
const MockContract = artifacts.require("MockContract");
const APYLiquidityPool = artifacts.require("APYLiquidityPool");
const APT = artifacts.require("APT");

ZERO_ADDRESS = constants.ZERO_ADDRESS;
DUMMY_ADDRESS = "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE";

contract("APYManager", async (accounts) => {
  const [deployer, wallet, other] = accounts;

  let apyManager;
  let pool;
  let apt;

  beforeEach(async () => {
    apyManager = await APYManager.new();
  });

  it("can drain ETH from liquidity pool", async () => {});

  it("can enter strategy", async () => {});

  it("can exit strategy", async () => {});

  it("can reinvest strategy using unused ETH", async () => {});
});
