/*
 * Command to run test script:
 *
 * $ yarn buidler --network <network name> run test-deploy/test_deploy.js
 */
require("dotenv").config();
const { ethers, artifacts } = require("@nomiclabs/buidler");
const ERC20 = artifacts.require("ERC20");

const { expect } = require("chai");
const {
  CHAIN_IDS,
  DEPLOYS_JSON,
  TOKEN_AGG_MAP,
} = require("../utils/constants.js");
const { erc20 } = require("../utils/helpers.js");
const PROXY_ADMIN_ADDRESSES = require(DEPLOYS_JSON["ProxyAdmin"]);

const main = async () => {
  const NETWORK_NAME = network.name.toUpperCase();
  console.log("");
  console.log(`${NETWORK_NAME} selected`);
  console.log("");

  const provider = ethers.provider;
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  console.log("Account 0 (deployer):", await deployer.getAddress());

  // pick random user, not used for something else
  const user = signers[8];
  console.log("Account 8 (user):", await user.getAddress());

  let admin = await ethers.getContractAt(
    "ProxyAdmin",
    PROXY_ADMIN_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
  );

  for ({ symbol } of TOKEN_AGG_MAP[NETWORK_NAME]) {
    console.log("");
    console.log(`Start tests for ${symbol}`);
    console.log("");

    const POOL_PROXY_ADDRESSES = require(DEPLOYS_JSON[
      symbol + "_APYPoolTokenProxy"
    ]);
    const APYPoolToken = await ethers.getContractFactory("APYPoolToken");
    let pool = await APYPoolToken.attach(
      POOL_PROXY_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
    );

    console.log("Check logic is accessible through the proxy...");
    pool = pool.connect(user);
    expect(await pool.decimals()).to.equal(18);
    expect(await pool.symbol()).to.equal("APT");
    expect(await pool.name()).to.equal("APY Pool Token");

    // 1. check admin address is set on the proxy, both ways:
    //    a. set in the admin slot in proxy, so it works
    //    b. set in logic contract's portion of storage, to protect the initializer
    // 2. check logic address is set on the proxy
    console.log(
      "Check admin address set in both unstructured and structured storage..."
    );
    admin = admin.connect(user);
    expect(await admin.getProxyAdmin(pool.address)).to.equal(admin.address);
    expect(await pool.proxyAdmin()).to.equal(admin.address);
    const POOL_TOKEN_ADDRESSES = require(DEPLOYS_JSON[
      symbol + "_APYPoolToken"
    ]);
    expect(await admin.getProxyImplementation(pool.address)).to.equal(
      POOL_TOKEN_ADDRESSES[CHAIN_IDS[NETWORK_NAME]]
    );

    console.log("Check underlyer is correct...");
    const tokenAddress = await pool.underlyer();
    const token = new ethers.Contract(tokenAddress, ERC20.abi).connect(user);
    expect(await token.symbol()).to.equal(symbol);

    console.log("Check chainlink is setup...");
    const price = await pool.getTokenEthPrice();
    console.log(`    --> ${symbol} price: ${price}`);
    expect(price.toNumber()).to.be.gt(0);

    console.log("Check pool is locked...");
    await expectRevert(pool.addLiquidity(erc20("1")), "Pausable: paused");
  }
};

main()
  .then((text) => {
    console.log("");
    console.log("Finished with no errors.");
    console.log("");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
