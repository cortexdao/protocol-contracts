const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder } = ethers.utils;
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
const MockContract = artifacts.require("MockContract");
const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYLiquidityPoolProxy = artifacts.require("APYLiquidityPoolProxy");
const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplementationTEST"
);
const IERC20 = new ethers.utils.Interface(artifacts.require("IERC20").abi);
const ERC20 = new ethers.utils.Interface(artifacts.require("ERC20").abi);

const { erc20 } = require("../utils/helpers");

contract("APYLiquidityPoolImplementation Unit Test", async (accounts) => {
  const [owner, instanceAdmin, randomUser, randomAddress] = accounts;

  let proxyAdmin;
  let logic;
  let proxy;
  let instance;
  let mockToken;

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
    proxyAdmin = await ProxyAdmin.new({ from: owner });
    logic = await APYLiquidityPoolImplementation.new({ from: owner });
    proxy = await APYLiquidityPoolProxy.new(logic.address, proxyAdmin.address, {
      from: owner,
    });
    instance = await APYLiquidityPoolImplementation.at(proxy.address);
    mockToken = await MockContract.new();
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

    it("Test setAdminAddress fail", async () => {
      await expectRevert.unspecified(
        instance.setAdminAddress(instanceAdmin, { from: randomUser })
      );
    });
  });

  describe("Test addTokenSupport", async () => {
    it("Test addSupportedTokens with invalid token", async () => {
      await expectRevert(
        instance.addTokenSupport(constants.ZERO_ADDRESS, randomAddress),
        "INVALID_TOKEN"
      );
    });

    it("Test addSupportedTokens with invalid agg", async () => {
      await expectRevert(
        instance.addTokenSupport(randomAddress, constants.ZERO_ADDRESS),
        "INVALID_AGG"
      );
    });

    it("Test addTokenSupport when not owner", async () => {
      await expectRevert(
        instance.addTokenSupport(randomAddress, randomAddress, {
          from: randomAddress,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Test addTokenSupport pass", async () => {
      const newToken = await MockContract.new();
      const newPriceAgg = await MockContract.new();
      const trx = await instance.addTokenSupport(
        newToken.address,
        newPriceAgg.address
      );

      const priceAgg = await instance.priceAggs.call(newToken.address);
      const supportedTokens = await instance.getSupportedTokens.call();

      assert.equal(priceAgg, newPriceAgg.address);
      assert.equal(supportedTokens[0], newToken.address);
      await expectEvent(trx, "TokenSupported", {
        token: newToken.address,
        agg: newPriceAgg.address,
      });
    });
  });

  describe("Test removeTokenSupport", async () => {
    it("Test removeTokenSupport with invalid token", async () => {
      await expectRevert(
        instance.removeTokenSupport(constants.ZERO_ADDRESS),
        "INVALID_TOKEN"
      );
    });

    it("Test removeTokenSupport when not owner", async () => {
      await expectRevert(
        instance.removeTokenSupport(randomAddress, { from: randomAddress }),
        "Ownable: caller is not the owner"
      );
    });

    it("Test removeTokenSupport pass", async () => {
      const newToken = await MockContract.new();
      const newPriceAgg = await MockContract.new();
      await instance.addTokenSupport(newToken.address, newPriceAgg.address);
      const trx = await instance.removeTokenSupport(newToken.address);

      const supportedTokens = await instance.getSupportedTokens.call();
      assert.equal(supportedTokens[0], constants.ZERO_ADDRESS);

      await expectEvent(trx, "TokenUnsupported", {
        token: newToken.address,
        agg: newPriceAgg.address,
      });
    });
  });

  describe("Test addLiquidity", async () => {
    it("Test addLiquidity insufficient amount", async () => {
      await expectRevert(
        instance.addLiquidity(0, constants.ZERO_ADDRESS),
        "AMOUNT_INSUFFICIENT"
      );
    });

    it("Test addLiquidity insufficient allowance", async () => {
      const allowance = IERC20.encodeFunctionData("allowance", [
        owner,
        instance.address,
      ]);
      const mockAgg = await MockContract.new();
      await instance.addTokenSupport(mockToken.address, mockAgg.address);
      await mockToken.givenMethodReturnUint(allowance, 0);
      await expectRevert(
        instance.addLiquidity(1, mockToken.address),
        "ALLOWANCE_INSUFFICIENT"
      );
    });

    it("Test addLiquidity unsupported token", async () => {
      await expectRevert(
        instance.addLiquidity(1, constants.ZERO_ADDRESS),
        "UNSUPPORTED_TOKEN"
      );
    });

    it("Test addLiquidity pass", async () => {
      const allowance = IERC20.encodeFunctionData("allowance", [
        randomUser,
        instance.address,
      ]);
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        instance.address,
      ]);
      const transferFrom = IERC20.encodeFunctionData("transferFrom", [
        randomUser,
        instance.address,
        1,
      ]);
      await mockToken.givenMethodReturnUint(allowance, 1);
      await mockToken.givenMethodReturnUint(balanceOf, 1);
      await mockToken.givenMethodReturnBool(transferFrom, true);

      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 1, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await instance.addTokenSupport(mockToken.address, mockAgg.address);

      const trx = await instance.addLiquidity(1, mockToken.address, {
        from: randomUser,
      });

      const balance = await instance.balanceOf(randomUser);
      assert.equal(balance.toNumber(), 1000);
      await expectEvent(trx, "Transfer");
      await expectEvent(trx, "DepositedAPT");
      const count = await mockToken.invocationCountForMethod.call(transferFrom);
      assert.equal(count, 1);
    });

    it("Test locking/unlocking addLiquidity by owner", async () => {
      const allowance = IERC20.encodeFunctionData("allowance", [
        randomUser,
        instance.address,
      ]);
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        instance.address,
      ]);
      const transferFrom = IERC20.encodeFunctionData("transferFrom", [
        randomUser,
        instance.address,
        1,
      ]);
      await mockToken.givenMethodReturnUint(allowance, 1);
      await mockToken.givenMethodReturnUint(balanceOf, 1);
      await mockToken.givenMethodReturnBool(transferFrom, true);

      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 10, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await instance.addTokenSupport(mockToken.address, mockAgg.address);

      let trx = await instance.lockAddLiquidity({ from: owner });
      await expectEvent(trx, "AddLiquidityLocked");

      await expectRevert(
        instance.addLiquidity(1, mockToken.address, { from: randomUser }),
        "LOCKED"
      );

      trx = await instance.unlockAddLiquidity({ from: owner });
      await expectEvent(trx, "AddLiquidityUnlocked");

      await instance.addLiquidity(1, mockToken.address, { from: randomUser });
    });

    it("Test locking/unlocking addLiquidity by not owner", async () => {
      await expectRevert(
        instance.lockAddLiquidity({ from: randomUser }),
        "Ownable: caller is not the owner"
      );
      await expectRevert(
        instance.unlockAddLiquidity({ from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Test getPoolTotalEthValue", async () => {
    it("Test getPoolTotalEthValue returns expected", async () => {
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        instance.address,
      ]);

      const tokenA = await MockContract.new();
      tokenA.givenMethodReturnUint(balanceOf, 1);

      const tokenB = await MockContract.new();
      tokenB.givenMethodReturnUint(balanceOf, 1);

      const tokenC = await MockContract.new();
      tokenC.givenMethodReturnUint(balanceOf, 1);

      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 100, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await instance.addTokenSupport(tokenA.address, mockAgg.address);
      await instance.addTokenSupport(tokenB.address, mockAgg.address);
      await instance.addTokenSupport(tokenC.address, mockAgg.address);

      const val = await instance.getPoolTotalEthValue.call();
      assert.equal(val.toNumber(), 300);
    });
  });

  describe("Test getAPTEthValue", async () => {
    it("Test getAPTEthValue when insufficient total supply", async () => {
      await expectRevert(instance.getAPTEthValue(10), "INSUFFICIENT_TOTAL_SUPPLY")
    })

    it("Test getAPTEthValue returns expected", async () => {
      await instance.mint(randomUser, 100);

      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        instance.address,
      ]);

      const tokenA = await MockContract.new();
      tokenA.givenMethodReturnUint(balanceOf, 1);

      const tokenB = await MockContract.new();
      tokenB.givenMethodReturnUint(balanceOf, 1);

      const tokenC = await MockContract.new();
      tokenC.givenMethodReturnUint(balanceOf, 1);

      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 100, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await instance.addTokenSupport(tokenA.address, mockAgg.address);
      await instance.addTokenSupport(tokenB.address, mockAgg.address);
      await instance.addTokenSupport(tokenC.address, mockAgg.address);

      const val = await instance.getAPTEthValue(10);
      assert.equal(val.toNumber(), 30);
    });
  });

  describe("Test getTokenAmountFromEthValue", async () => {
    it("Test getEthValueFromTokenAmount returns expected amount", async () => {
      const tokenA = await MockContract.new();
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 100, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      await instance.addTokenSupport(tokenA.address, mockAgg.address);
      // ((10 ^ 0) * 100) / 100
      const tokenAmount = await instance.getTokenAmountFromEthValue(100, tokenA.address)
      assert.equal(tokenAmount.toNumber(), 1)
    });
  })

  describe("Test getEthValueFromTokenAmount", async () => {
    it("Test getEthValueFromTokenAmount returns 0 with 0 amount", async () => {
      const val = await instance.getEthValueFromTokenAmount(0, mockToken.address)
      assert.equal(val.toNumber(), 0)
    })

    it("Test getEthValueFromTokenAmount returns expected amount", async () => {
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 100, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      await instance.addTokenSupport(mockToken.address, mockAgg.address)

      const val = await instance.getEthValueFromTokenAmount(1, mockToken.address)
      assert.equal(val.toNumber(), 100)
    })
  });

  describe("Test getTokenEthPrice", async () => {
    it("Test getTokenEthPrice returns unexpected", async () => {
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 0, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      const newToken = await MockContract.new();
      await instance.addTokenSupport(newToken.address, mockAgg.address);
      await expectRevert(
        instance.getTokenEthPrice.call(newToken.address),
        "UNABLE_TO_RETRIEVE_ETH_PRICE"
      );
    });

    it("Test getTokenEthPrice returns expected", async () => {
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 100, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      const newToken = await MockContract.new();
      await instance.addTokenSupport(newToken.address, mockAgg.address);
      const price = await instance.getTokenEthPrice.call(newToken.address);
      assert.equal(price, 100);
    });
  });

  describe("Test redeem", async () => {
    it("Test redeem insufficient amount", async () => {
      await expectRevert(
        instance.redeem(0, constants.ZERO_ADDRESS),
        "AMOUNT_INSUFFICIENT"
      );
    });

    it("Test redeem insufficient balance", async () => {
      await instance.mint(randomUser, 1);
      await expectRevert(
        instance.redeem(2, constants.ZERO_ADDRESS, { from: randomUser }),
        "BALANCE_INSUFFICIENT"
      );
    });

    it("Test redeem pass", async () => {
      await instance.mint(randomUser, 100);
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 10, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      const transferFrom = IERC20.encodeFunctionData("transfer", [
        randomUser,
        1,
      ]);
      await mockToken.givenMethodReturnBool(transferFrom, true);
      await instance.addTokenSupport(mockToken.address, mockAgg.address);

      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        instance.address,
      ]);
      mockToken.givenMethodReturnUint(balanceOf, 1);

      const trx = await instance.redeem(50, mockToken.address, {
        from: randomUser,
      });

      const balance = await instance.balanceOf(randomUser);
      assert.equal(balance.toNumber(), 50);
      await expectEvent(trx, "Transfer");
      await expectEvent(trx, "RedeemedAPT");
    });

    it("Test locking/unlocking redeem by owner", async () => {
      await instance.mint(randomUser, 100);
      const mockAgg = await MockContract.new();
      await instance.addTokenSupport(mockToken.address, mockAgg.address);

      let trx = await instance.lockRedeem({ from: owner });
      expectEvent(trx, "RedeemLocked");

      await expectRevert(
        instance.redeem(50, mockToken.address, { from: randomUser }),
        "LOCKED"
      );
      trx = await instance.lockRedeem({ from: owner });

      trx = await instance.unlockRedeem({ from: owner });
      expectEvent(trx, "RedeemUnlocked");
    });

    it("Test locking/unlocking contract by not owner", async () => {
      await instance.mint(randomUser, 100);
      const mockAgg = await MockContract.new();
      await instance.addTokenSupport(mockToken.address, mockAgg.address);

      let trx = await instance.lock({ from: owner });
      expectEvent(trx, "Paused");

      await expectRevert(
        instance.redeem(50, mockToken.address, { from: randomUser }),
        "Pausable: paused"
      );

      trx = await instance.unlock({ from: owner });
      expectEvent(trx, "Unpaused");
    });

    it("Test locking/unlocking redeem by not owner", async () => {
      await expectRevert(
        instance.lockRedeem({ from: randomUser }),
        "Ownable: caller is not the owner"
      );
      await expectRevert(
        instance.unlockRedeem({ from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Test calculateMintAmount", async () => {
    it("Test calculateMintAmount when token is 0 and total supply is 0", async () => {
      // total supply is 0

      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        instance.address,
      ]);
      await mockToken.givenMethodReturnUint(balanceOf, 0);

      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 1, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await instance.addTokenSupport(mockToken.address, mockAgg.address);

      const mintAmount = await instance.calculateMintAmount(1000, mockToken.address);
      assert.equal(mintAmount.toNumber(), 1000000);
    });

    it("Test calculateMintAmount when balanceOf > 0 and total supply is 0", async () => {
      // total supply is 0

      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        instance.address,
      ]);
      await mockToken.givenMethodReturnUint(balanceOf, 9999);
      const returnData = abiCoder.encode(

        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 1, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      await instance.addTokenSupport(mockToken.address, mockAgg.address);

      const mintAmount = await instance.calculateMintAmount(1000, mockToken.address);
      assert.equal(mintAmount.toNumber(), 1000000);
    });

    it("Test calculateMintAmount returns expeted amount when total supply > 0", async () => {
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        instance.address,
      ]);
      await mockToken.givenMethodReturnUint(balanceOf, 9999);
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 1, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      await instance.addTokenSupport(mockToken.address, mockAgg.address);

      await instance.mint(randomUser, 900);
      // (1000/9999) * 900 = 90.0090009001 ~= 90
      const mintAmount = await instance.calculateMintAmount(1000, mockToken.address, {
        from: randomUser,
      });
      assert.equal(mintAmount.toNumber(), 90);
    });

    it("Test calculateMintAmount returns expeted amount when total supply is 0", async () => {
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        instance.address,
      ]);
      await mockToken.givenMethodReturnUint(balanceOf, 9999);
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 1, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      await instance.addTokenSupport(mockToken.address, mockAgg.address);

      // 90 * 1000 = 90000
      const mintAmount = await instance.calculateMintAmount(90, mockToken.address, {
        from: randomUser,
      });
      assert.equal(mintAmount.toNumber(), 90000);
    });
  });

  describe("Test getUnderlyerAmount", async () => {
    it("Test getUnderlyerAmount when divide by zero", async () => {
      await expectRevert(
        instance.getUnderlyerAmount.call(100, mockToken.address),
        "INSUFFICIENT_TOTAL_SUPPLY"
      );
    });

    it("Test getUnderlyerAmount returns expected amount", async () => {
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [ZERO_ADDRESS]);
      await mockToken.givenMethodReturnUint(balanceOf, "1");
      const decimals = ERC20.encodeFunctionData("decimals");
      await mockToken.givenMethodReturnUint(decimals, "1");
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 10, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await instance.addTokenSupport(mockToken.address, mockAgg.address);
      await instance.mint(randomUser, 1);
      const underlyerAmount = await instance.getUnderlyerAmount.call(
        "1",
        mockToken.address
      );
      expect(underlyerAmount).to.bignumber.equal("1");
    });
  });
});
