const { ethers, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder } = ethers.utils;
const {
  BN,
  constants,
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYPoolTokenProxy = artifacts.require("APYPoolTokenProxy");
const APYPoolToken = artifacts.require("APYPoolToken");
const IERC20 = artifacts.require("IERC20");
const IERC20_Interface = new ethers.utils.Interface(IERC20.abi);

contract("APYPoolToken Integration Test", async (accounts) => {
  const [owner, instanceAdmin, randomUser, randomAddress] = accounts;


  let proxyAdmin;
  let logic;
  let proxy;
  let instance;

  console.log("BEFORE")

  before("Setup", async () => {
    console.log("SETUP")
    // console.log(IERC20)
    const DAI = await IERC20.at('0x6B175474E89094C44Da98b954EedeAC495271d0F')
    const UDSC = await IERC20.at('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
    const USDT = await IERC20.at('0xdAC17F958D2ee523a2206206994597C13D831ec7')

    const DAI_AGG = '0x773616E4d11A78F511299002da57A0a94577F1f4'
    const UDSC_AGG = '0x986b5E1e1755e3C2440e960477f25201B0a8bbD4'
    const USDT_AGG = '0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46'

    console.log("seroiusly")

    //   proxyAdmin = await ProxyAdmin.new({ from: owner });
    //   logic = await APYPoolToken.new({ from: owner });
    //   proxy = await APYPoolTokenProxy.new(logic.address, proxyAdmin.address, {
    //     from: owner,
    //   });
    //   instance = await APYPoolToken.at(proxy.address);

    //   console.log(`Proxy Admin: ${proxyAdmin.address}`)
    //   console.log(`Logic: ${logic.address}`)
    //   console.log(`Proxy: ${proxy.address}`)
  });

  // describe("Test Defaults", async () => {
  //   it("Test Owner", async () => {
  //     assert.equal(await instance.owner.call(), owner);
  //   });

  //   it("Test DEFAULT_APT_TO_UNDERLYER_FACTOR", async () => {
  //     assert.equal(await instance.DEFAULT_APT_TO_UNDERLYER_FACTOR.call(), 1000);
  //   });

  //   it("Test Pool Token Name", async () => {
  //     assert.equal(await instance.name.call(), "APY Pool Token");
  //   });

  //   it("Test Pool Symbol", async () => {
  //     assert.equal(await instance.symbol.call(), "APT");
  //   });

  //   it("Test Pool Decimals", async () => {
  //     assert.equal(await instance.decimals.call(), 18);
  //   });

  //   it("Test sending Ether", async () => {
  //     await expectRevert(instance.send(10), "DONT_SEND_ETHER");
  //   });
  // });

  // describe("Test setAdminAdddress", async () => {
  //   it("Test setAdminAddress pass", async () => {
  //     await instance.setAdminAddress(instanceAdmin, { from: owner });
  //     assert.equal(await instance.proxyAdmin.call(), instanceAdmin);
  //   });
  // });

  // describe("Test addTokenSupport", async () => {
  //   it("Test addTokenSupport for DAI, USDC, USDT", async () => {
  //     let trx
  //     trx = await instance.addTokenSupport(
  //       DAI.address,
  //       DAI_AGG.address
  //     );
  //     await expectEvent(trx, "TokenSupported", {
  //       token: DAI.address,
  //       agg: DAI_AGG.address,
  //     });

  //     trx = await instance.addTokenSupport(
  //       UDSC.address,
  //       UDSC_AGG.address
  //     );
  //     await expectEvent(trx, "TokenSupported", {
  //       token: USDC.address,
  //       agg: USDC_AGG.address,
  //     });

  //     trx = await instance.addTokenSupport(
  //       USDT.address,
  //       USDT_AGG.address
  //     );
  //     await expectEvent(trx, "TokenSupported", {
  //       token: USDT.address,
  //       agg: USDT_AGG.address
  //     });

  //     // check aggs
  //     let priceAgg
  //     priceAgg = await instance.priceAggs.call(DAI.address);
  //     assert.equal(priceAgg, DAI_AGG.address);

  //     priceAgg = await instance.priceAggs.call(UDSC.address);
  //     assert.equal(priceAgg, USDC.address);

  //     priceAgg = await instance.priceAggs.call(UDST.address);
  //     assert.equal(priceAgg, USDT.address);

  //     // check supported tokens
  //     const supportedTokens = await instance.getSupportedTokens.call();
  //     assert.equal(supportedTokens[0], DAI.address);
  //     assert.equal(supportedTokens[1], UDSC.address);
  //     assert.equal(supportedTokens[2], USDT.address);
  //   });
  // });

  // describe("Test removeTokenSupport", async () => {
  // it("Test removeTokenSupport for USDC", async () => {
  //   const trx = await instance.removeTokenSupport(UDSC.address);

  //   // check aggs
  //   let priceAgg
  //   priceAgg = await instance.priceAggs.call(DAI.address);
  //   assert.equal(priceAgg, DAI_AGG.address);

  //   priceAgg = await instance.priceAggs.call(UDSC.address);
  //   assert.equal(priceAgg, USDC.address);

  //   priceAgg = await instance.priceAggs.call(UDST.address);
  //   assert.equal(priceAgg, USDT.address);

  //   // check supported tokens
  //   const supportedTokens = await instance.getSupportedTokens.call();
  //   assert.equal(supportedTokens[0], DAI.address);
  //   assert.equal(supportedTokens[1], ZERO_ADDRESS); // USDC removed
  //   assert.equal(supportedTokens[2], USDT.address);

  //   await expectEvent(trx, "TokenUnsupported", {
  //     token: USDC.address,
  //     agg: USDC_AGG.address,
  //   });
  // });
  // });

  //checkpoint

  // describe.skip("Test addLiquidity", async () => {
  //   it("Test addLiquidity insufficient amount", async () => {
  //     await expectRevert(
  //       instance.addLiquidity(0, constants.ZERO_ADDRESS),
  //       "AMOUNT_INSUFFICIENT"
  //     );
  //   });

  //   it("Test addLiquidity insufficient allowance", async () => {
  //     const allowance = IERC20.encodeFunctionData("allowance", [
  //       owner,
  //       instance.address,
  //     ]);
  //     const mockAgg = await MockContract.new();
  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);
  //     await mockToken.givenMethodReturnUint(allowance, 0);
  //     await expectRevert(
  //       instance.addLiquidity(1, mockToken.address),
  //       "ALLOWANCE_INSUFFICIENT"
  //     );
  //   });

  //   it("Test addLiquidity unsupported token", async () => {
  //     await expectRevert(
  //       instance.addLiquidity(1, constants.ZERO_ADDRESS),
  //       "UNSUPPORTED_TOKEN"
  //     );
  //   });

  //   it("Test addLiquidity pass", async () => {
  //     const allowance = IERC20.encodeFunctionData("allowance", [
  //       randomUser,
  //       instance.address,
  //     ]);
  //     const balanceOf = IERC20.encodeFunctionData("balanceOf", [
  //       instance.address,
  //     ]);
  //     const transferFrom = IERC20.encodeFunctionData("transferFrom", [
  //       randomUser,
  //       instance.address,
  //       1,
  //     ]);
  //     await mockToken.givenMethodReturnUint(allowance, 1);
  //     await mockToken.givenMethodReturnUint(balanceOf, 1);
  //     await mockToken.givenMethodReturnBool(transferFrom, true);

  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 1, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);

  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);

  //     const trx = await instance.addLiquidity(1, mockToken.address, {
  //       from: randomUser,
  //     });

  //     const balance = await instance.balanceOf(randomUser);
  //     assert.equal(balance.toNumber(), 1000);
  //     // this is the mint transfer
  //     await expectEvent(trx, "Transfer",
  //       {
  //         from: ZERO_ADDRESS,
  //         to: randomUser,
  //         value: new BN(1000)
  //       }
  //     );
  //     await expectEvent(trx, "DepositedAPT",
  //       {
  //         sender: randomUser,
  //         token: mockToken.address,
  //         tokenAmount: new BN(1),
  //         aptMintAmount: new BN(1000),
  //         tokenEthValue: new BN(1),
  //         totalEthValueLocked: new BN(1)
  //       }
  //     );
  //     const count = await mockToken.invocationCountForMethod.call(transferFrom);
  //     assert.equal(count, 1);
  //   });

  //   it("Test locking/unlocking addLiquidity by owner", async () => {
  //     const allowance = IERC20.encodeFunctionData("allowance", [
  //       randomUser,
  //       instance.address,
  //     ]);
  //     const balanceOf = IERC20.encodeFunctionData("balanceOf", [
  //       instance.address,
  //     ]);
  //     const transferFrom = IERC20.encodeFunctionData("transferFrom", [
  //       randomUser,
  //       instance.address,
  //       1,
  //     ]);
  //     await mockToken.givenMethodReturnUint(allowance, 1);
  //     await mockToken.givenMethodReturnUint(balanceOf, 1);
  //     await mockToken.givenMethodReturnBool(transferFrom, true);

  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 10, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);

  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);

  //     let trx = await instance.lockAddLiquidity({ from: owner });
  //     await expectEvent(trx, "AddLiquidityLocked");

  //     await expectRevert(
  //       instance.addLiquidity(1, mockToken.address, { from: randomUser }),
  //       "LOCKED"
  //     );

  //     trx = await instance.unlockAddLiquidity({ from: owner });
  //     await expectEvent(trx, "AddLiquidityUnlocked");

  //     await instance.addLiquidity(1, mockToken.address, { from: randomUser });
  //   });

  //   it("Test locking/unlocking addLiquidity by not owner", async () => {
  //     await expectRevert(
  //       instance.lockAddLiquidity({ from: randomUser }),
  //       "Ownable: caller is not the owner"
  //     );
  //     await expectRevert(
  //       instance.unlockAddLiquidity({ from: randomUser }),
  //       "Ownable: caller is not the owner"
  //     );
  //   });
  // });

  // describe.skip("Test getPoolTotalEthValue", async () => {
  //   it("Test getPoolTotalEthValue returns expected", async () => {
  //     const balanceOf = IERC20.encodeFunctionData("balanceOf", [
  //       instance.address,
  //     ]);

  //     const tokenA = await MockContract.new();
  //     tokenA.givenMethodReturnUint(balanceOf, 1);

  //     const tokenB = await MockContract.new();
  //     tokenB.givenMethodReturnUint(balanceOf, 1);

  //     const tokenC = await MockContract.new();
  //     tokenC.givenMethodReturnUint(balanceOf, 1);

  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 100, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);

  //     await instance.addTokenSupport(tokenA.address, mockAgg.address);
  //     await instance.addTokenSupport(tokenB.address, mockAgg.address);
  //     await instance.addTokenSupport(tokenC.address, mockAgg.address);

  //     const val = await instance.getPoolTotalEthValue.call();
  //     assert.equal(val.toNumber(), 300);
  //   });
  // });

  // describe.skip("Test getAPTEthValue", async () => {
  //   it("Test getAPTEthValue when insufficient total supply", async () => {
  //     await expectRevert(instance.getAPTEthValue(10), "INSUFFICIENT_TOTAL_SUPPLY")
  //   })

  //   it("Test getAPTEthValue returns expected", async () => {
  //     await instance.mint(randomUser, 100);

  //     const balanceOf = IERC20.encodeFunctionData("balanceOf", [
  //       instance.address,
  //     ]);

  //     const tokenA = await MockContract.new();
  //     tokenA.givenMethodReturnUint(balanceOf, 1);

  //     const tokenB = await MockContract.new();
  //     tokenB.givenMethodReturnUint(balanceOf, 1);

  //     const tokenC = await MockContract.new();
  //     tokenC.givenMethodReturnUint(balanceOf, 1);

  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 100, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);

  //     await instance.addTokenSupport(tokenA.address, mockAgg.address);
  //     await instance.addTokenSupport(tokenB.address, mockAgg.address);
  //     await instance.addTokenSupport(tokenC.address, mockAgg.address);

  //     const val = await instance.getAPTEthValue(10);
  //     assert.equal(val.toNumber(), 30);
  //   });
  // });

  // describe.skip("Test getTokenAmountFromEthValue", async () => {
  //   it("Test getEthValueFromTokenAmount returns expected amount", async () => {
  //     const tokenA = await MockContract.new();
  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 100, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);
  //     await instance.addTokenSupport(tokenA.address, mockAgg.address);
  //     // ((10 ^ 0) * 100) / 100
  //     const tokenAmount = await instance.getTokenAmountFromEthValue(100, tokenA.address)
  //     assert.equal(tokenAmount.toNumber(), 1)
  //   });
  // })

  // describe.skip("Test getEthValueFromTokenAmount", async () => {
  //   it("Test getEthValueFromTokenAmount returns 0 with 0 amount", async () => {
  //     const val = await instance.getEthValueFromTokenAmount(0, mockToken.address)
  //     assert.equal(val.toNumber(), 0)
  //   })

  //   it("Test getEthValueFromTokenAmount returns expected amount", async () => {
  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 100, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);
  //     await instance.addTokenSupport(mockToken.address, mockAgg.address)

  //     const val = await instance.getEthValueFromTokenAmount(1, mockToken.address)
  //     assert.equal(val.toNumber(), 100)
  //   })
  // });

  // describe.skip("Test getTokenEthPrice", async () => {
  //   it("Test getTokenEthPrice returns unexpected", async () => {
  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 0, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);

  //     const newToken = await MockContract.new();
  //     await instance.addTokenSupport(newToken.address, mockAgg.address);
  //     await expectRevert(
  //       instance.getTokenEthPrice.call(newToken.address),
  //       "UNABLE_TO_RETRIEVE_ETH_PRICE"
  //     );
  //   });

  //   it("Test getTokenEthPrice returns expected", async () => {
  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 100, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);

  //     const newToken = await MockContract.new();
  //     await instance.addTokenSupport(newToken.address, mockAgg.address);
  //     const price = await instance.getTokenEthPrice.call(newToken.address);
  //     assert.equal(price, 100);
  //   });
  // });

  // describe.skip("Test redeem", async () => {
  //   it("Test redeem insufficient amount", async () => {
  //     await expectRevert(
  //       instance.redeem(0, constants.ZERO_ADDRESS),
  //       "AMOUNT_INSUFFICIENT"
  //     );
  //   });

  //   it("Test redeem insufficient balance", async () => {
  //     await instance.mint(randomUser, 1);
  //     await expectRevert(
  //       instance.redeem(2, constants.ZERO_ADDRESS, { from: randomUser }),
  //       "BALANCE_INSUFFICIENT"
  //     );
  //   });

  //   it("Test redeem pass", async () => {
  //     await instance.mint(randomUser, 1000);

  //     const allowance = IERC20.encodeFunctionData("allowance", [
  //       randomUser,
  //       instance.address,
  //     ]);
  //     const balanceOf = IERC20.encodeFunctionData("balanceOf", [
  //       instance.address,
  //     ]);
  //     const transfer = IERC20.encodeFunctionData("transfer", [
  //       randomUser,
  //       1,
  //     ]);
  //     await mockToken.givenMethodReturnUint(allowance, 1);
  //     await mockToken.givenMethodReturnUint(balanceOf, 1);
  //     await mockToken.givenMethodReturnBool(transfer, true);

  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 1, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);

  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);

  //     const trx = await instance.redeem(1000, mockToken.address, {
  //       from: randomUser,
  //     });

  //     const bal = await instance.balanceOf(randomUser);
  //     assert.equal(bal.toNumber(), 0);
  //     await expectEvent(trx, "Transfer",
  //       {
  //         from: randomUser,
  //         to: ZERO_ADDRESS,
  //         value: new BN(1000)
  //       }
  //     );
  //     await expectEvent(trx, "RedeemedAPT",
  //       {
  //         sender: randomUser,
  //         token: mockToken.address,
  //         redeemedTokenAmount: new BN(1),
  //         aptRedeemAmount: new BN(1000),
  //         tokenEthValue: new BN(1),
  //         totalEthValueLocked: new BN(1)
  //         //this value is a lie, but it's due to token.balance() = 1 and mockAgg.getLastRound() = 1
  //       }
  //     );
  //   });

  //   it("Test locking/unlocking redeem by owner", async () => {
  //     await instance.mint(randomUser, 100);
  //     const mockAgg = await MockContract.new();
  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);

  //     let trx = await instance.lockRedeem({ from: owner });
  //     expectEvent(trx, "RedeemLocked");

  //     await expectRevert(
  //       instance.redeem(50, mockToken.address, { from: randomUser }),
  //       "LOCKED"
  //     );
  //     trx = await instance.lockRedeem({ from: owner });

  //     trx = await instance.unlockRedeem({ from: owner });
  //     expectEvent(trx, "RedeemUnlocked");
  //   });

  //   it("Test locking/unlocking contract by not owner", async () => {
  //     await instance.mint(randomUser, 100);
  //     const mockAgg = await MockContract.new();
  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);

  //     let trx = await instance.lock({ from: owner });
  //     expectEvent(trx, "Paused");

  //     await expectRevert(
  //       instance.redeem(50, mockToken.address, { from: randomUser }),
  //       "Pausable: paused"
  //     );

  //     trx = await instance.unlock({ from: owner });
  //     expectEvent(trx, "Unpaused");
  //   });

  //   it("Test locking/unlocking redeem by not owner", async () => {
  //     await expectRevert(
  //       instance.lockRedeem({ from: randomUser }),
  //       "Ownable: caller is not the owner"
  //     );
  //     await expectRevert(
  //       instance.unlockRedeem({ from: randomUser }),
  //       "Ownable: caller is not the owner"
  //     );
  //   });
  // });

  // describe.skip("Test calculateMintAmount", async () => {
  //   it("Test calculateMintAmount when token is 0 and total supply is 0", async () => {
  //     // total supply is 0

  //     const balanceOf = IERC20.encodeFunctionData("balanceOf", [
  //       instance.address,
  //     ]);
  //     await mockToken.givenMethodReturnUint(balanceOf, 0);

  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 1, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);

  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);

  //     const mintAmount = await instance.calculateMintAmount(1000, mockToken.address);
  //     assert.equal(mintAmount.toNumber(), 1000000);
  //   });

  //   it("Test calculateMintAmount when balanceOf > 0 and total supply is 0", async () => {
  //     // total supply is 0

  //     const balanceOf = IERC20.encodeFunctionData("balanceOf", [
  //       instance.address,
  //     ]);
  //     await mockToken.givenMethodReturnUint(balanceOf, 9999);
  //     const returnData = abiCoder.encode(

  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 1, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);
  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);

  //     const mintAmount = await instance.calculateMintAmount(1000, mockToken.address);
  //     assert.equal(mintAmount.toNumber(), 1000000);
  //   });

  //   it("Test calculateMintAmount returns expeted amount when total supply > 0", async () => {
  //     const balanceOf = IERC20.encodeFunctionData("balanceOf", [
  //       instance.address,
  //     ]);
  //     await mockToken.givenMethodReturnUint(balanceOf, 9999);
  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 1, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);
  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);

  //     await instance.mint(randomUser, 900);
  //     // (1000/9999) * 900 = 90.0090009001 ~= 90
  //     const mintAmount = await instance.calculateMintAmount(1000, mockToken.address, {
  //       from: randomUser,
  //     });
  //     assert.equal(mintAmount.toNumber(), 90);
  //   });

  //   it("Test calculateMintAmount returns expeted amount when total supply is 0", async () => {
  //     const balanceOf = IERC20.encodeFunctionData("balanceOf", [
  //       instance.address,
  //     ]);
  //     await mockToken.givenMethodReturnUint(balanceOf, 9999);
  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 1, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);
  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);

  //     // 90 * 1000 = 90000
  //     const mintAmount = await instance.calculateMintAmount(90, mockToken.address, {
  //       from: randomUser,
  //     });
  //     assert.equal(mintAmount.toNumber(), 90000);
  //   });
  // });

  // describe.skip("Test getUnderlyerAmount", async () => {
  //   it("Test getUnderlyerAmount when divide by zero", async () => {
  //     await expectRevert(
  //       instance.getUnderlyerAmount.call(100, mockToken.address),
  //       "INSUFFICIENT_TOTAL_SUPPLY"
  //     );
  //   });

  //   it("Test getUnderlyerAmount returns expected amount", async () => {
  //     const balanceOf = IERC20.encodeFunctionData("balanceOf", [ZERO_ADDRESS]);
  //     await mockToken.givenMethodReturnUint(balanceOf, "1");
  //     const decimals = ERC20.encodeFunctionData("decimals");
  //     await mockToken.givenMethodReturnUint(decimals, "1");
  //     const returnData = abiCoder.encode(
  //       ["uint80", "int256", "uint256", "uint256", "uint80"],
  //       [0, 10, 0, 0, 0]
  //     );
  //     const mockAgg = await MockContract.new();
  //     await mockAgg.givenAnyReturn(returnData);

  //     await instance.addTokenSupport(mockToken.address, mockAgg.address);
  //     await instance.mint(randomUser, 1);
  //     const underlyerAmount = await instance.getUnderlyerAmount.call(
  //       "1",
  //       mockToken.address
  //     );
  //     expect(underlyerAmount).to.bignumber.equal("1");
  //   });
  // });
});
