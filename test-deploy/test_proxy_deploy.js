/*
 * Command to run test script:
 *
 * $ yarn buidler --network kovan run test-deploy/test_proxy_deploy.js
 */
require("dotenv").config();
const APYLiquidityPoolImplementationArtifact = require("../deployments/kovan/APYLiquidityPoolImplementation.json");
const APYLiquidityPoolProxyArtifact = require("../deployments/kovan/APYLiquidityPoolProxy.json");
const ProxyAdminArtifact = require("../deployments/kovan/ProxyAdmin.json");
const { ethers, web3, artifacts } = require("@nomiclabs/buidler");
const { abiCoder } = ethers.utils;
const IERC20 = artifacts.require("IERC20");
const ERC20 = artifacts.require("ERC20");

const { BN } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { erc20 } = require("../utils/helpers");
const { expectRevert } = require("@openzeppelin/test-helpers");

const mnemonic = process.env.KOVAN_MNEMONIC;
const endpoint = process.env.KOVAN_ENDPOINT;
console.log("Endpoint:", endpoint);

const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(endpoint);

  const logicAddress = APYLiquidityPoolImplementationArtifact.address;
  const logicAbi = APYLiquidityPoolImplementationArtifact.abi;
  const proxyAddress = APYLiquidityPoolProxyArtifact.address;
  const adminAddress = ProxyAdminArtifact.address;
  const adminAbi = ProxyAdminArtifact.abi;

  let logic = new ethers.Contract(logicAddress, logicAbi);
  let pool = new ethers.Contract(proxyAddress, logicAbi);
  let admin = new ethers.Contract(adminAddress, adminAbi);

  const deployerWallet = ethers.Wallet.fromMnemonic(mnemonic).connect(provider);
  console.log("Account 0 (deployer):", deployerWallet.address);

  path = "m/44'/60'/0'/0/2";
  const userWallet = ethers.Wallet.fromMnemonic(mnemonic, path).connect(
    provider
  );
  console.log("Account 2 (test user):", userWallet.address);

  // check logic is accessible through the proxy
  pool = pool.connect(userWallet);
  expect(await pool.decimals()).to.equal(18);
  expect(await pool.symbol()).to.equal("APT");
  expect(await pool.name()).to.equal("APY Pool Token");

  // 1. check admin address is set on the proxy, both ways:
  //    a. set in the admin slot in proxy, so it works
  //    b. set in logic contract's portion of storage, to protect the initializer
  // 2. check logic address is set on the proxy
  admin = admin.connect(userWallet);
  expect(await admin.getProxyAdmin(pool.address)).to.equal(admin.address);
  expect(await pool.proxyAdmin()).to.equal(admin.address);
  expect(await admin.getProxyImplementation(pool.address)).to.equal(
    logic.address
  );

  // check tokens and chainlink is setup
  const tokenAddresses = await pool.getSupportedTokens();
  const tokenSymbols = [];
  for (const address of tokenAddresses) {
    const token = new ethers.Contract(address, ERC20.abi).connect(userWallet);
    const symbol = await token.symbol();
    tokenSymbols.push(symbol);

    const price = await pool.getTokenEthPrice(address);
    console.log(`${symbol}: ${price}`);

    expect(price.toNumber()).to.be.gt(0);
  }
  expect(new Set(tokenSymbols)).to.eql(new Set(["DAI", "USDC", "USDT"]));

  for (const address of tokenAddresses) {
  }
};

main()
  .then((text) => {
    console.log("END");
    console.log("Exit message:", text);
  })
  .catch((err) => {
    // Deal with the fact the chain failed
    console.error(err);
  });
