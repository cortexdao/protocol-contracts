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

  await token.transfer(receiver, funds, { from: fundAccount })
  const tokenBal = await token.balanceOf(receiver)
  console.log(`${token.address} Balance: ${tokenBal.toString()}`)
}

contract("APYPoolToken Integration Test USDC", async (accounts) => {
  const [owner, instanceAdmin, randomUser, randomAddress] = accounts;

  let USDC_AGG
  let USDC

  let proxyAdmin;
  let logic;
  let proxy;
  let instance;

  let expectedAPTMinted;
  let aptMinted;
  let usdcBalBefore;

  before("Setup", async () => {
    USDC = await ERC20.at('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    USDC_AGG = await AGG.at('0x986b5E1e1755e3C2440e960477f25201B0a8bbD4')

    proxyAdmin = await ProxyAdmin.new({ from: owner });
    logic = await APYPoolToken.new({ from: owner });
    proxy = await APYPoolTokenProxy.new(
      logic.address,
      proxyAdmin.address,
      USDC.address,
      USDC_AGG.address,
      {
        from: owner,
      }
    );
    instance = await APYPoolToken.at(proxy.address);

    await acquireToken(USDC_WHALE, owner, USDC, "1000000")

    //handle allownaces
    await USDC.approve(instance.address, MAX_UINT256)

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

  describe("Test calculateMintAmount", async () => {
    it("Test calculateMintAmount returns expeted amount when total supply > 0", async () => {
      expectedAPTMinted = await instance.calculateMintAmount(1000000000, {
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

      const amount = 1000000000
      const trx = await instance.addLiquidity(amount, {
        from: owner,
      });

      let bal = await USDC.balanceOf(owner)
      console.log(`\tUSDC Balance After Mint: ${bal.toString()}`)

      // assert balances
      assert(await USDC.balanceOf(instance.address), amount)
      assert(await USDC.balanceOf(owner), usdcBalBefore - amount)

      // comupting the exact amount is unreliable due to variance in USDC/ETH
      aptMinted = await instance.balanceOf(owner);
      console.log(`\tAPT Balance: ${aptMinted.toString()}`)
      assert(aptMinted.toString(), expectedAPTMinted.toString())

      const tokenEthVal = await instance.getEthValueFromTokenAmount(amount)

      // this is the token transfer
      await expectEvent.inTransaction(trx.tx, USDC, "Transfer", {
        from: owner,
        to: instance.address,
        value: new BN(amount)
      })
      // this is the mint transfer
      await expectEvent(trx, "Transfer", {
        from: ZERO_ADDRESS,
        to: owner,
        value: aptMinted
      });
      await expectEvent(trx, "DepositedAPT", {
        sender: owner,
        tokenAmount: new BN(amount),
        aptMintAmount: aptMinted,
        tokenEthValue: tokenEthVal,
        totalEthValueLocked: tokenEthVal
      });
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
      const tokenAmount = await instance.getTokenAmountFromEthValue.call(new BN(500))
      console.log(`\tToken Amount from Eth Value: ${tokenAmount.toString()}`)
      assert(tokenAmount.gt(0))
    });
  })

  describe("Test getEthValueFromTokenAmount", async () => {
    it("Test getEthValueFromTokenAmount returns value", async () => {
      const val = await instance.getEthValueFromTokenAmount.call(new BN(5000))
      console.log(`\tEth Value from Token Amount ${val.toString()}`)
      assert(val.gt(0))
    })
  });

  describe("Test getTokenEthPrice", async () => {
    it("Test getTokenEthPrice returns value", async () => {
      const price = await instance.getTokenEthPrice.call();
      console.log(`\tToken Eth Price: ${price.toString()}`)
      assert(price.gt(0))
    });
  });

  describe("Test getUnderlyerAmount", async () => {
    it("Test getUnderlyerAmount returns value", async () => {
      const underlyerAmount = await instance.getUnderlyerAmount.call(
        new BN("2605000000000000000000"),
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
        instance.redeem(50, { from: randomUser }),
        "LOCKED"
      );

      trx = await instance.unlockRedeem({ from: owner });
      expectEvent(trx, "RedeemUnlocked");
    });

    it("Test locking/unlocking contract by not owner", async () => {
      let trx = await instance.lock({ from: owner });
      expectEvent(trx, "Paused");

      await expectRevert(
        instance.redeem(50, { from: randomUser }),
        "Pausable: paused"
      );

      trx = await instance.unlock({ from: owner });
      expectEvent(trx, "Unpaused");
    });

    it("Test redeem insufficient balance", async () => {
      await expectRevert(
        instance.redeem(2, { from: randomUser }),
        "BALANCE_INSUFFICIENT"
      );
    });

    it("Test redeem pass", async () => {
      let usdc_bal = await USDC.balanceOf(owner);
      console.log(`\tUSDC Balance Before Redeem: ${usdc_bal.toString()}`)

      const trx = await instance.redeem(aptMinted, {
        from: owner,
      });

      let usdc_bal_after = await USDC.balanceOf(owner);
      console.log(`\tUSDC Balance After Redeem: ${usdc_bal_after.toString()}`)

      // assert balances
      assert.equal(usdc_bal_after.toString(), usdcBalBefore.toString())
      assert.equal(await USDC.balanceOf(instance.address), 0)

      const bal = await instance.balanceOf(owner);
      console.log(`\tAPT Balance: ${bal.toString()}`)
      assert.equal(bal.toString(), "0");

      const tokenEthVal = await instance.getEthValueFromTokenAmount(usdc_bal_after.sub(usdc_bal))

      await expectEvent.inTransaction(trx.tx, USDC, "Transfer", {
        from: instance.address,
        to: owner,
        value: usdc_bal_after.sub(usdc_bal)
      })
      await expectEvent(trx, "Transfer", {
        from: owner,
        to: ZERO_ADDRESS,
        value: aptMinted
      })
      await expectEvent(trx, "RedeemedAPT", {
        sender: owner,
        token: USDC.address,
        redeemedTokenAmount: usdc_bal_after.sub(usdc_bal),
        tokenEthValue: tokenEthVal,
        totalEthValueLocked: new BN(0)
      });
    });

  });
});

// contract("APYPoolToken Integration DAI", async (accounts) => {
//   const [owner, instanceAdmin, randomUser, randomAddress] = accounts;

//   let DAI_AGG
//   let DAI

//   let proxyAdmin;
//   let logic;
//   let proxy;
//   let instance;

//   let expectedAPTMinted;
//   let aptMinted;
//   let daiBalBefore;

//   before("Setup", async () => {
//     DAI = await ERC20.at('0x6B175474E89094C44Da98b954EedeAC495271d0F')
//     DAI_AGG = await AGG.at('0x773616E4d11A78F511299002da57A0a94577F1f4')

//     proxyAdmin = await ProxyAdmin.new({ from: owner });
//     logic = await APYPoolToken.new({ from: owner });
//     proxy = await APYPoolTokenProxy.new(
//       logic.address,
//       proxyAdmin.address,
//       DAI.address,
//       DAI_AGG.address,
//       {
//         from: owner,
//       }
//     );
//     instance = await APYPoolToken.at(proxy.address);

//     await acquireToken(DAI_WHALE, owner, DAI, "10000")

//     //handle allownaces
//     await DAI.approve(instance.address, MAX_UINT256)

//     console.log(`Proxy Admin: ${proxyAdmin.address}`)
//     console.log(`Logic: ${logic.address}`)
//     console.log(`Proxy: ${proxy.address}`)
//   });

//   describe("Test Defaults", async () => {
//     it("Test Owner", async () => {
//       assert.equal(await instance.owner.call(), owner);
//     });

//     it("Test DEFAULT_APT_TO_UNDERLYER_FACTOR", async () => {
//       assert.equal(await instance.DEFAULT_APT_TO_UNDERLYER_FACTOR.call(), 1000);
//     });

//     it("Test Pool Token Name", async () => {
//       assert.equal(await instance.name.call(), "APY Pool Token");
//     });

//     it("Test Pool Symbol", async () => {
//       assert.equal(await instance.symbol.call(), "APT");
//     });

//     it("Test Pool Decimals", async () => {
//       assert.equal(await instance.decimals.call(), 18);
//     });

//     it("Test sending Ether", async () => {
//       await expectRevert(instance.send(10), "DONT_SEND_ETHER");
//     });
//   });

//   describe("Test setAdminAdddress", async () => {
//     it("Test setAdminAddress pass", async () => {
//       await instance.setAdminAddress(instanceAdmin, { from: owner });
//       assert.equal(await instance.proxyAdmin.call(), instanceAdmin);
//     });
//   });

//   describe("Test calculateMintAmount", async () => {
//     it("Test calculateMintAmount returns expeted amount when total supply > 0", async () => {
//       expectedAPTMinted = await instance.calculateMintAmount(1000000000, {
//         from: randomUser,
//       });
//       console.log(`\tExpected APT Minted: ${expectedAPTMinted.toString()}`)
//       assert(expectedAPTMinted.gt(0))
//     });
//   });

//   describe("Test addLiquidity", async () => {
//     it("Test locking/unlocking addLiquidity by owner", async () => {
//       let trx = await instance.lockAddLiquidity({ from: owner });
//       await expectEvent(trx, "AddLiquidityLocked");

//       trx = await instance.unlockAddLiquidity({ from: owner });
//       await expectEvent(trx, "AddLiquidityUnlocked");
//     });

//     it("Test addLiquidity pass", async () => {
//       daiBalBefore = await DAI.balanceOf(owner)
//       console.log(`\tDAI Balance Before Mint: ${daiBalBefore.toString()}`)

//       const amount = 10000
//       const trx = await instance.addLiquidity(amount, {
//         from: owner,
//       });

//       let bal = await DAI.balanceOf(owner)
//       console.log(`\tDAI Balance After Mint: ${bal.toString()}`)

//       // assert balances
//       assert(await DAI.balanceOf(instance.address), amount)
//       assert(await DAI.balanceOf(owner), daiBalBefore - amount)

//       // comupting the exact amount is unreliable due to variance in DAI/ETH
//       aptMinted = await instance.balanceOf(owner);
//       console.log(`\tAPT Balance: ${aptMinted.toString()}`)
//       assert(aptMinted.toString(), expectedAPTMinted.toString())

//       const tokenEthVal = await instance.getEthValueFromTokenAmount(amount)

//       // this is the token transfer
//       await expectEvent.inTransaction(trx.tx, DAI, "Transfer", {
//         from: owner,
//         to: instance.address,
//         value: new BN(amount)
//       })
//       // this is the mint transfer
//       await expectEvent(trx, "Transfer", {
//         from: ZERO_ADDRESS,
//         to: owner,
//         value: aptMinted
//       });
//       await expectEvent(trx, "DepositedAPT", {
//         sender: owner,
//         tokenAmount: new BN(amount),
//         aptMintAmount: aptMinted,
//         tokenEthValue: tokenEthVal,
//         totalEthValueLocked: tokenEthVal
//       });
//     });
//   });

//   describe("Test getPoolTotalEthValue", async () => {
//     it("Test getPoolTotalEthValue returns value", async () => {
//       const val = await instance.getPoolTotalEthValue.call();
//       console.log(`\tPool Total Eth Value ${val.toString()}`)
//       assert(val.toString(), aptMinted.div(new BN(1000)).toString())
//     });
//   });

//   describe("Test getAPTEthValue", async () => {
//     it("Test getAPTEthValue returns value", async () => {
//       const val = await instance.getAPTEthValue(aptMinted);
//       console.log(`\tAPT Eth Value: ${val.toString()}`)
//       assert(val.toString(), aptMinted.div(new BN(1000)).toString())
//     });
//   });

//   describe("Test getTokenAmountFromEthValue", async () => {
//     it("Test getTokenAmountFromEthValue returns expected amount", async () => {
//       const tokenAmount = await instance.getTokenAmountFromEthValue.call(new BN(500))
//       console.log(`\tToken Amount from Eth Value: ${tokenAmount.toString()}`)
//       assert(tokenAmount.gt(0))
//     });
//   })

//   describe("Test getEthValueFromTokenAmount", async () => {
//     it("Test getEthValueFromTokenAmount returns value", async () => {
//       const val = await instance.getEthValueFromTokenAmount.call(new BN(5000))
//       console.log(`\tEth Value from Token Amount ${val.toString()}`)
//       assert(val.gt(0))
//     })
//   });

//   describe("Test getTokenEthPrice", async () => {
//     it("Test getTokenEthPrice returns value", async () => {
//       const price = await instance.getTokenEthPrice.call();
//       console.log(`\tToken Eth Price: ${price.toString()}`)
//       assert(price.gt(0))
//     });
//   });

//   describe("Test getUnderlyerAmount", async () => {
//     it("Test getUnderlyerAmount returns value", async () => {
//       const underlyerAmount = await instance.getUnderlyerAmount.call(
//         new BN("2605000000000000000000"),
//       );
//       console.log(`\tUnderlyer Amount: ${underlyerAmount.toString()}`);
//       assert(underlyerAmount.gt(0))
//     });
//   });

//   describe("Test redeem", async () => {
//     it("Test locking/unlocking redeem by owner", async () => {
//       let trx = await instance.lockRedeem({ from: owner });
//       expectEvent(trx, "RedeemLocked");

//       await expectRevert(
//         instance.redeem(50, { from: randomUser }),
//         "LOCKED"
//       );

//       trx = await instance.unlockRedeem({ from: owner });
//       expectEvent(trx, "RedeemUnlocked");
//     });

//     it("Test locking/unlocking contract by not owner", async () => {
//       let trx = await instance.lock({ from: owner });
//       expectEvent(trx, "Paused");

//       await expectRevert(
//         instance.redeem(50, { from: randomUser }),
//         "Pausable: paused"
//       );

//       trx = await instance.unlock({ from: owner });
//       expectEvent(trx, "Unpaused");
//     });

//     it("Test redeem insufficient balance", async () => {
//       await expectRevert(
//         instance.redeem(2, { from: randomUser }),
//         "BALANCE_INSUFFICIENT"
//       );
//     });

//     it("Test redeem pass", async () => {
//       let dai_bal = await DAI.balanceOf(owner);
//       console.log(`\tDAI Balance Before Redeem: ${dai_bal.toString()}`)

//       const trx = await instance.redeem(aptMinted, {
//         from: owner,
//       });

//       dai_bal = await DAI.balanceOf(owner);
//       console.log(`\tDAI Balance After Redeem: ${dai_bal.toString()}`)

//       // assert balances
//       assert.equal(dai_bal.toString(), daiBalBefore.toString())
//       assert.equal(await DAI.balanceOf(instance.address), 0)

//       const bal = await instance.balanceOf(owner);
//       console.log(`\tAPT Balance: ${bal.toString()}`)
//       assert.equal(bal.toString(), "0");

//       await expectEvent(trx, "Transfer");
//       await expectEvent(trx, "RedeemedAPT");
//     });
//   });
// });

// contract("APYPoolToken Integration USDT", async (accounts) => {
//   const [owner, instanceAdmin, randomUser, randomAddress] = accounts;

//   let USDT_AGG
//   let USDT

//   let proxyAdmin;
//   let logic;
//   let proxy;
//   let instance;

//   let expectedAPTMinted;
//   let aptMinted;
//   let usdtBalBefore;

//   before("Setup", async () => {
//     USDT = await ERC20.at('0xdAC17F958D2ee523a2206206994597C13D831ec7')
//     USDT_AGG = await AGG.at('0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46')

//     proxyAdmin = await ProxyAdmin.new({ from: owner });
//     logic = await APYPoolToken.new({ from: owner });
//     proxy = await APYPoolTokenProxy.new(
//       logic.address,
//       proxyAdmin.address,
//       USDT.address,
//       USDT_AGG.address,
//       {
//         from: owner,
//       }
//     );
//     instance = await APYPoolToken.at(proxy.address);

//     await acquireToken(USDT_WHALE, owner, USDT, "1000000")

//     //handle allownaces
//     await USDT.approve(instance.address, MAX_UINT256)

//     console.log(`Proxy Admin: ${proxyAdmin.address}`)
//     console.log(`Logic: ${logic.address}`)
//     console.log(`Proxy: ${proxy.address}`)
//   });

//   describe("Test Defaults", async () => {
//     it("Test Owner", async () => {
//       assert.equal(await instance.owner.call(), owner);
//     });

//     it("Test DEFAULT_APT_TO_UNDERLYER_FACTOR", async () => {
//       assert.equal(await instance.DEFAULT_APT_TO_UNDERLYER_FACTOR.call(), 1000);
//     });

//     it("Test Pool Token Name", async () => {
//       assert.equal(await instance.name.call(), "APY Pool Token");
//     });

//     it("Test Pool Symbol", async () => {
//       assert.equal(await instance.symbol.call(), "APT");
//     });

//     it("Test Pool Decimals", async () => {
//       assert.equal(await instance.decimals.call(), 18);
//     });

//     it("Test sending Ether", async () => {
//       await expectRevert(instance.send(10), "DONT_SEND_ETHER");
//     });
//   });

//   describe("Test setAdminAdddress", async () => {
//     it("Test setAdminAddress pass", async () => {
//       await instance.setAdminAddress(instanceAdmin, { from: owner });
//       assert.equal(await instance.proxyAdmin.call(), instanceAdmin);
//     });
//   });

//   describe("Test calculateMintAmount", async () => {
//     it("Test calculateMintAmount returns expeted amount when total supply > 0", async () => {
//       expectedAPTMinted = await instance.calculateMintAmount(1000000000, {
//         from: randomUser,
//       });
//       console.log(`\tExpected APT Minted: ${expectedAPTMinted.toString()}`)
//       assert(expectedAPTMinted.gt(0))
//     });
//   });

//   describe("Test addLiquidity", async () => {
//     it("Test locking/unlocking addLiquidity by owner", async () => {
//       let trx = await instance.lockAddLiquidity({ from: owner });
//       await expectEvent(trx, "AddLiquidityLocked");

//       trx = await instance.unlockAddLiquidity({ from: owner });
//       await expectEvent(trx, "AddLiquidityUnlocked");
//     });

//     it("Test addLiquidity pass", async () => {
//       usdtBalBefore = await USDT.balanceOf(owner)
//       console.log(`\tUSDT Balance Before Mint: ${usdtBalBefore.toString()}`)

//       const amount = 1000000000
//       const trx = await instance.addLiquidity(amount, {
//         from: owner,
//       });

//       let bal = await USDT.balanceOf(owner)
//       console.log(`\tUSDT Balance After Mint: ${bal.toString()}`)

//       // assert balances
//       assert(await USDT.balanceOf(instance.address), amount)
//       assert(await USDT.balanceOf(owner), usdtBalBefore - amount)

//       // comupting the exact amount is unreliable due to variance in USDT/ETH
//       aptMinted = await instance.balanceOf(owner);
//       console.log(`\tAPT Balance: ${aptMinted.toString()}`)
//       assert(aptMinted.toString(), expectedAPTMinted.toString())

//       const tokenEthVal = await instance.getEthValueFromTokenAmount(amount)

//       // this is the token transfer
//       await expectEvent.inTransaction(trx.tx, USDT, "Transfer", {
//         from: owner,
//         to: instance.address,
//         value: new BN(amount)
//       })
//       // this is the mint transfer
//       await expectEvent(trx, "Transfer", {
//         from: ZERO_ADDRESS,
//         to: owner,
//         value: aptMinted
//       });
//       await expectEvent(trx, "DepositedAPT", {
//         sender: owner,
//         tokenAmount: new BN(amount),
//         aptMintAmount: aptMinted,
//         tokenEthValue: tokenEthVal,
//         totalEthValueLocked: tokenEthVal
//       });
//     });
//   });

//   describe("Test getPoolTotalEthValue", async () => {
//     it("Test getPoolTotalEthValue returns value", async () => {
//       const val = await instance.getPoolTotalEthValue.call();
//       console.log(`\tPool Total Eth Value ${val.toString()}`)
//       assert(val.toString(), aptMinted.div(new BN(1000)).toString())
//     });
//   });

//   describe("Test getAPTEthValue", async () => {
//     it("Test getAPTEthValue returns value", async () => {
//       const val = await instance.getAPTEthValue(aptMinted);
//       console.log(`\tAPT Eth Value: ${val.toString()}`)
//       assert(val.toString(), aptMinted.div(new BN(1000)).toString())
//     });
//   });

//   describe("Test getTokenAmountFromEthValue", async () => {
//     it("Test getTokenAmountFromEthValue returns expected amount", async () => {
//       const tokenAmount = await instance.getTokenAmountFromEthValue.call(new BN(500))
//       console.log(`\tToken Amount from Eth Value: ${tokenAmount.toString()}`)
//       assert(tokenAmount.gt(0))
//     });
//   })

//   describe("Test getEthValueFromTokenAmount", async () => {
//     it("Test getEthValueFromTokenAmount returns value", async () => {
//       const val = await instance.getEthValueFromTokenAmount.call(new BN(5000))
//       console.log(`\tEth Value from Token Amount ${val.toString()}`)
//       assert(val.gt(0))
//     })
//   });

//   describe("Test getTokenEthPrice", async () => {
//     it("Test getTokenEthPrice returns value", async () => {
//       const price = await instance.getTokenEthPrice.call();
//       console.log(`\tToken Eth Price: ${price.toString()}`)
//       assert(price.gt(0))
//     });
//   });

//   describe("Test getUnderlyerAmount", async () => {
//     it("Test getUnderlyerAmount returns value", async () => {
//       const underlyerAmount = await instance.getUnderlyerAmount.call(
//         new BN("2605000000000000000000"),
//       );
//       console.log(`\tUnderlyer Amount: ${underlyerAmount.toString()}`);
//       assert(underlyerAmount.gt(0))
//     });
//   });

//   describe("Test redeem", async () => {
//     it("Test locking/unlocking redeem by owner", async () => {
//       let trx = await instance.lockRedeem({ from: owner });
//       expectEvent(trx, "RedeemLocked");

//       await expectRevert(
//         instance.redeem(50, { from: randomUser }),
//         "LOCKED"
//       );

//       trx = await instance.unlockRedeem({ from: owner });
//       expectEvent(trx, "RedeemUnlocked");
//     });

//     it("Test locking/unlocking contract by not owner", async () => {
//       let trx = await instance.lock({ from: owner });
//       expectEvent(trx, "Paused");

//       await expectRevert(
//         instance.redeem(50, { from: randomUser }),
//         "Pausable: paused"
//       );

//       trx = await instance.unlock({ from: owner });
//       expectEvent(trx, "Unpaused");
//     });

//     it("Test redeem insufficient balance", async () => {
//       await expectRevert(
//         instance.redeem(2, { from: randomUser }),
//         "BALANCE_INSUFFICIENT"
//       );
//     });

//     it("Test redeem pass", async () => {
//       let usdt_bal = await USDT.balanceOf(owner);
//       console.log(`\tUSDT Balance Before Redeem: ${usdt_bal.toString()}`)

//       const trx = await instance.redeem(aptMinted, {
//         from: owner,
//       });

//       usdt_bal = await USDT.balanceOf(owner);
//       console.log(`\tUSDT Balance After Redeem: ${usdt_bal.toString()}`)

//       // assert balances
//       assert.equal(usdt_bal.toString(), usdtBalBefore.toString())
//       assert.equal(await USDT.balanceOf(instance.address), 0)

//       const bal = await instance.balanceOf(owner);
//       console.log(`\tAPT Balance: ${bal.toString()}`)
//       assert.equal(bal.toString(), "0");

//       await expectEvent(trx, "Transfer");
//       await expectEvent(trx, "RedeemedAPT");
//     });
//   });
// });
