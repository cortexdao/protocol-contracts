const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder } = ethers.utils;
const {
  BN,
  constants,
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");
const {
  DAI_WHALE,
  USDC_WHALE,
  USDT_WHALE
} = require("../utils/constants");
const { expect } = require("chai");
const { ZERO_ADDRESS, MAX_UINT256 } = require("@openzeppelin/test-helpers/src/constants");
const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYPoolTokenProxy = artifacts.require("APYPoolTokenProxy");
const APYPoolToken = artifacts.require("APYPoolToken");
const AGG = artifacts.require("AggregatorV3Interface.sol")
const IERC20 = artifacts.require("IERC20");
const ERC20 = artifacts.require("ERC20");
const IERC20_Interface = new ethers.utils.Interface(IERC20.abi);

async function acquireToken(fundAccount, receiver, token, amount) {
  // NOTE: Ganache is setup to control the WHALE addresses. This method moves requeted funds out of the fund account and into the specified wallet

  // fund the account with ETH so it can move funds
  await web3.eth.sendTransaction({ from: receiver, to: fundAccount, value: 1e10 })

  const decimals = await token.decimals.call()
  const funds = (new BN("10").pow(decimals)).mul(new BN(amount))

  // await token.approve(owner, MAX_UINT256, { from: fundAccount })
  await token.transfer(receiver, funds, { from: fundAccount })
  const tokenBal = await token.balanceOf(receiver)
  console.log(`${token.address} Balance: ${tokenBal.toString()}`)
}

contract("APYPoolToken Integration Test", async (accounts) => {
  const [owner, instanceAdmin, randomUser, randomAddress] = accounts;

  let DAI_AGG
  let USDC_AGG
  let USDT_AGG
  let DAI
  let USDC
  let USDT

  let proxyAdmin;
  let logic;
  let proxy;
  let instance;

  let expectedAPTMinted;
  let aptMinted;
  let usdcBalBefore;

  before("Setup", async () => {
    DAI = await ERC20.at('0x6B175474E89094C44Da98b954EedeAC495271d0F')
    USDC = await ERC20.at('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    USDT = await ERC20.at('0xdAC17F958D2ee523a2206206994597C13D831ec7')
    DAI_AGG = await AGG.at('0x773616E4d11A78F511299002da57A0a94577F1f4')
    USDC_AGG = await AGG.at('0x986b5E1e1755e3C2440e960477f25201B0a8bbD4')
    USDT_AGG = await AGG.at('0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46')

    proxyAdmin = await ProxyAdmin.new({ from: owner });
    logic = await APYPoolToken.new({ from: owner });
    proxy = await APYPoolTokenProxy.new(logic.address, proxyAdmin.address, {
      from: owner,
    });
    instance = await APYPoolToken.at(proxy.address);

    await acquireToken(DAI_WHALE, owner, DAI, "1000000")
    await acquireToken(USDC_WHALE, owner, USDC, "1000000")
    await acquireToken(USDT_WHALE, owner, USDT, "1000000")

    //handle allownaces
    await DAI.approve(instance.address, MAX_UINT256)
    await USDC.approve(instance.address, MAX_UINT256)
    await USDT.approve(instance.address, MAX_UINT256)

    console.log(`Proxy Admin: ${proxyAdmin.address}`)
    console.log(`Logic: ${logic.address}`)
    console.log(`Proxy: ${proxy.address}`)
  });

  describe("Test Defaults", async () => {
    it("Test Owner", async () => {
      assert.equal(await instance.owner.call(), owner);
    });

    it("Test DEFAULT_APT_TO_UNDERLYER_FACTOR", async () => {
      assert.equal(await instance.DEFAULT_APT_TO_UNDERLYER_FACTOR.call(), 1000);
    });

    it("Test Pool Token Name", async () => {
      assert.equal(await instance.name.call(), "APY Pool Token");
    });

    it("Test Pool Symbol", async () => {
      assert.equal(await instance.symbol.call(), "APT");
    });

    it("Test Pool Decimals", async () => {
      assert.equal(await instance.decimals.call(), 18);
    });

    it("Test sending Ether", async () => {
      await expectRevert(instance.send(10), "DONT_SEND_ETHER");
    });
  });

  describe("Test setAdminAdddress", async () => {
    it("Test setAdminAddress pass", async () => {
      await instance.setAdminAddress(instanceAdmin, { from: owner });
      assert.equal(await instance.proxyAdmin.call(), instanceAdmin);
    });
  });

  describe("Test addTokenSupport", async () => {
    it("Test addTokenSupport for DAI, USDC, USDT", async () => {
      let trx
      trx = await instance.addTokenSupport(
        DAI.address,
        DAI_AGG.address
      );
      await expectEvent(trx, "TokenSupported", {
        token: DAI.address,
        agg: DAI_AGG.address,
      });

      trx = await instance.addTokenSupport(
        USDC.address,
        USDC_AGG.address
      );
      await expectEvent(trx, "TokenSupported", {
        token: USDC.address,
        agg: USDC_AGG.address,
      });

      trx = await instance.addTokenSupport(
        USDT.address,
        USDT_AGG.address
      );
      await expectEvent(trx, "TokenSupported", {
        token: USDT.address,
        agg: USDT_AGG.address
      });

      // check aggs
      let priceAgg
      priceAgg = await instance.priceAggs.call(DAI.address);
      assert.equal(priceAgg, DAI_AGG.address);

      priceAgg = await instance.priceAggs.call(USDC.address);
      assert.equal(priceAgg, USDC_AGG.address);

      priceAgg = await instance.priceAggs.call(USDT.address);
      assert.equal(priceAgg, USDT_AGG.address);

      // check supported tokens
      const supportedTokens = await instance.getSupportedTokens.call();
      assert.equal(supportedTokens[0], DAI.address);
      assert.equal(supportedTokens[1], USDC.address);
      assert.equal(supportedTokens[2], USDT.address);
    });
  });

  describe("Test removeTokenSupport", async () => {
    it("Test removeTokenSupport for USDC", async () => {
      const trx = await instance.removeTokenSupport(USDT.address);

      // check aggs
      let priceAgg
      priceAgg = await instance.priceAggs.call(DAI.address);
      assert.equal(priceAgg, DAI_AGG.address);

      priceAgg = await instance.priceAggs.call(USDC.address);
      assert.equal(priceAgg, USDC_AGG.address);

      priceAgg = await instance.priceAggs.call(USDT.address);
      assert.equal(priceAgg, ZERO_ADDRESS); // USDT removed

      // check supported tokens
      const supportedTokens = await instance.getSupportedTokens.call();
      assert.equal(supportedTokens[0], DAI.address);
      assert.equal(supportedTokens[1], USDC.address);
      assert.equal(supportedTokens[2], ZERO_ADDRESS); // USDT removed

      await expectEvent(trx, "TokenUnsupported", {
        token: USDT.address,
        agg: USDT_AGG.address,
      });
    });
  });

  describe("Test calculateMintAmount", async () => {
    it("Test calculateMintAmount returns expeted amount when total supply > 0", async () => {
      expectedAPTMinted = await instance.calculateMintAmount(1000000000, USDC.address, {
        from: randomUser,
      });
      console.log(`\tExpected APT Minted: ${expectedAPTMinted.toString()}`)
      assert(expectedAPTMinted.gt(0))
    });
  });

  describe("Test addLiquidity", async () => {
    it("Test locking/unlocking addLiquidity by owner", async () => {
      let trx = await instance.lockAddLiquidity({ from: owner });
      await expectEvent(trx, "AddLiquidityLocked");

      trx = await instance.unlockAddLiquidity({ from: owner });
      await expectEvent(trx, "AddLiquidityUnlocked");
    });

    it("Test addLiquidity pass", async () => {
      usdcBalBefore = await USDC.balanceOf(owner)
      console.log(`\tUSDC Balance Before Mint: ${usdcBalBefore.toString()}`)

      const trx = await instance.addLiquidity(1000000000, USDC.address, {
        from: owner,
      });

      let bal = await USDC.balanceOf(owner)
      console.log(`\tUSDC Balance After Mint: ${bal.toString()}`)

      // comupting the exact amount is unreliable due to variance in USDC/ETH
      aptMinted = await instance.balanceOf(owner);
      console.log(`\tAPT Balance: ${aptMinted.toString()}`)
      assert(aptMinted.toString(), expectedAPTMinted.toString())

      // this is the mint transfer
      await expectEvent(trx, "Transfer");
      await expectEvent(trx, "DepositedAPT");
    });
  });

  describe("Test getPoolTotalEthValue", async () => {
    it("Test getPoolTotalEthValue returns value", async () => {
      const val = await instance.getPoolTotalEthValue.call();
      console.log(`\tPool Total Eth Value ${val.toString()}`)
      assert(val.toString(), aptMinted.div(new BN(1000)).toString())
    });
  });

  describe("Test getAPTEthValue", async () => {
    it("Test getAPTEthValue returns value", async () => {
      const val = await instance.getAPTEthValue(aptMinted);
      console.log(`\tAPT Eth Value: ${val.toString()}`)
      assert(val.toString(), aptMinted.div(new BN(1000)).toString())
    });
  });

  describe("Test getTokenAmountFromEthValue", async () => {
    it("Test getTokenAmountFromEthValue returns expected amount", async () => {
      const tokenAmount = await instance.getTokenAmountFromEthValue.call(new BN(500), DAI.address)
      console.log(`\tToken Amount from Eth Value: ${tokenAmount.toString()}`)
      assert(tokenAmount.gt(0))
    });
  })

  describe("Test getEthValueFromTokenAmount", async () => {
    it("Test getEthValueFromTokenAmount returns value", async () => {
      const val = await instance.getEthValueFromTokenAmount.call(new BN(5000), DAI.address)
      console.log(`\tEth Value from Token Amount ${val.toString()}`)
      assert(val.gt(0))
    })
  });

  describe("Test getTokenEthPrice", async () => {
    it("Test getTokenEthPrice returns value", async () => {
      const price = await instance.getTokenEthPrice.call(DAI.address);
      console.log(`\tToken Eth Price: ${price.toString()}`)
      assert(price.gt(0))
    });
  });

  describe("Test getUnderlyerAmount", async () => {
    it("Test getUnderlyerAmount returns value", async () => {
      const underlyerAmount = await instance.getUnderlyerAmount.call(
        new BN("2605000000000000000000"),
        DAI.address
      );
      console.log(`\tUnderlyer Amount: ${underlyerAmount.toString()}`);
      assert(underlyerAmount.gt(0))
    });
  });

  describe("Test redeem", async () => {
    it("Test locking/unlocking redeem by owner", async () => {
      let trx = await instance.lockRedeem({ from: owner });
      expectEvent(trx, "RedeemLocked");

      await expectRevert(
        instance.redeem(50, DAI.address, { from: randomUser }),
        "LOCKED"
      );

      trx = await instance.unlockRedeem({ from: owner });
      expectEvent(trx, "RedeemUnlocked");
    });

    it("Test locking/unlocking contract by not owner", async () => {
      let trx = await instance.lock({ from: owner });
      expectEvent(trx, "Paused");

      await expectRevert(
        instance.redeem(50, DAI.address, { from: randomUser }),
        "Pausable: paused"
      );

      trx = await instance.unlock({ from: owner });
      expectEvent(trx, "Unpaused");
    });
    it("Test redeem insufficient balance", async () => {
      await expectRevert(
        instance.redeem(2, DAI.address, { from: randomUser }),
        "BALANCE_INSUFFICIENT"
      );
    });

    it("Test redeem pass", async () => {
      let usdc_bal = await USDC.balanceOf(owner);
      console.log(`\tUSDC Balance Before Redeem: ${usdc_bal.toString()}`)

      const trx = await instance.redeem(aptMinted, USDC.address, {
        from: owner,
      });

      usdc_bal = await USDC.balanceOf(owner);
      console.log(`\tUSDC Balance After Redeem: ${usdc_bal.toString()}`)
      assert.equal(usdc_bal.toString(), usdcBalBefore.toString())

      const bal = await instance.balanceOf(owner);
      console.log(`\tAPT Balance: ${bal.toString()}`)
      assert.equal(bal.toString(), "0");

      await expectEvent(trx, "Transfer");
      await expectEvent(trx, "RedeemedAPT");
    });

  });
});
