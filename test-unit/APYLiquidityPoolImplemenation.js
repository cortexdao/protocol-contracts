const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
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
const dai = ether;
const MockContract = artifacts.require("MockContract");
const ProxyAdmin = artifacts.require("ProxyAdmin");
const APYLiquidityPoolProxy = artifacts.require("APYLiquidityPoolProxy");
const APYLiquidityPoolImplementation = artifacts.require(
  "APYLiquidityPoolImplementationTEST"
);
const { DAI } = require('../utils/Compound');

contract("APYLiquidityPoolImplementation Unit Test", async (accounts) => {
  const [owner, instanceAdmin, randomUser] = accounts;

  let proxyAdmin
  let logic
  let proxy
  let instance
  let mockToken

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
    proxyAdmin = await ProxyAdmin.new({ from: owner })
    logic = await APYLiquidityPoolImplementation.new({ from: owner });
    proxy = await APYLiquidityPoolProxy.new(logic.address, proxyAdmin.address, { from: owner });
    instance = await APYLiquidityPoolImplementation.at(proxy.address);
    mockToken = await MockContract.new()
  });

  describe("Test Defaults", async () => {
    it("Test Owner", async () => {
      assert.equal(await instance.owner.call(), owner)
    })

    it("Test DEFAULT_APT_TO_UNDERLYER_FACTOR", async () => {
      assert.equal(await instance.DEFAULT_APT_TO_UNDERLYER_FACTOR.call(), 1000)
    })

    it("Test Pool Token Name", async () => {
      assert.equal(await instance.name.call(), "APY Pool Token")
    })

    it("Test Pool Symbol", async () => {
      assert.equal(await instance.symbol.call(), "APT")
    })

    it("Test Pool Decimals", async () => {
      assert.equal(await instance.decimals.call(), 18)
    })

    it("Test sending Ether", async () => {
      await expectRevert(instance.send(10), "DONT_SEND_ETHER")
    })
  })

  describe("Test setAdminAdddress", async () => {
    it("Test setAdminAddress pass", async () => {
      await instance.setAdminAddress(instanceAdmin, { from: owner })
      assert.equal(await instance.admin.call(), instanceAdmin)
    })

    it("Test setAdminAddress fail", async () => {
      await expectRevert.unspecified(
        instance.setAdminAddress(instanceAdmin, { from: randomUser })
      )
    })
  })

  describe("Test setUnderlyerAddress", async () => {
    it("Test setUnderlyerAddress pass", async () => {
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
    })

    it("Test setUnderlyerAddress fail", async () => {
      await expectRevert.unspecified(
        instance.setUnderlyerAddress(mockToken.address, { from: randomUser })
      )
    })
  })

  describe("Test addLiquidity", async () => {
    it("Test addLiquidity insufficient amount", async () => {
      await expectRevert(instance.addLiquidity(0), "AMOUNT_INSUFFICIENT")
    })

    it("Test addLiquidity insufficient allowance", async () => {
      const allowance = DAI.interface.encodeFunctionData('allowance', [owner, instance.address])
      await mockToken.givenMethodReturnUint(allowance, 0)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      await expectRevert(instance.addLiquidity(1), "ALLOWANCE_INSUFFICIENT")
    })

    it("Test addLiquidity pass", async () => {
      const allowance = DAI.interface.encodeFunctionData('allowance', [randomUser, instance.address])
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      const transferFrom = DAI.interface.encodeFunctionData('transferFrom', [randomUser, instance.address, 1])
      await mockToken.givenMethodReturnUint(allowance, 1)
      await mockToken.givenMethodReturnUint(balanceOf, 1)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      const trx = await instance.addLiquidity(1, { from: randomUser })

      const balance = await instance.balanceOf(randomUser)
      assert.equal(balance.toNumber(), 1000)
      await expectEvent(trx, "Transfer")
      await expectEvent(trx, "DepositedAPT")
      const count = await mockToken.invocationCountForMethod.call(transferFrom)
      assert.equal(count, 1)
    })

    it("Test locking/unlocking addLiquidity by owner", async () => {
      const allowance = DAI.interface.encodeFunctionData('allowance', [randomUser, instance.address])
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      const transferFrom = DAI.interface.encodeFunctionData('transferFrom', [randomUser, instance.address, 1])
      await mockToken.givenMethodReturnUint(allowance, 1)
      await mockToken.givenMethodReturnUint(balanceOf, 1)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })

      let trx = await instance.lockAddLiquidity({ from: owner })
      await expectEvent(trx, "AddLiquidityLocked")

      await expectRevert(instance.addLiquidity(1, { from: randomUser }), "LOCKED")

      trx = await instance.unlockAddLiquidity({ from: owner })
      await expectEvent(trx, "AddLiquidityUnlocked")

      await instance.addLiquidity(1, { from: randomUser })
    })

    it("Test locking/unlocking addLiquidity by not owner", async () => {
      await expectRevert(instance.lockAddLiquidity({ from: randomUser }), "Ownable: caller is not the owner")
      await expectRevert(instance.unlockAddLiquidity({ from: randomUser }), "Ownable: caller is not the owner")
    })
  })

  describe("Test redeem", async () => {
    it("Test redeem insufficient amount", async () => {
      await expectRevert(instance.redeem(0), "AMOUNT_INSUFFICIENT")
    })

    it("Test redeem insufficient balance", async () => {
      await instance.mint(randomUser, 1)
      await expectRevert(instance.redeem(2, { from: randomUser }), "BALANCE_INSUFFICIENT")
    })

    it("Test redeem pass", async () => {
      await instance.mint(randomUser, 100)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      const trx = await instance.redeem(50, { from: randomUser })

      const balance = await instance.balanceOf(randomUser)
      assert.equal(balance.toNumber(), 50)
      await expectEvent(trx, "Transfer")
      await expectEvent(trx, "RedeemedAPT")
    })

    it("Test locking/unlocking redeem by owner", async () => {
      await instance.mint(randomUser, 100)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })

      let trx = await instance.lockRedeem({ from: owner })
      expectEvent(trx, "RedeemLocked")

      await expectRevert(instance.redeem(50, { from: randomUser }), "LOCKED")
      trx = await instance.lockRedeem({ from: owner })

      trx = await instance.unlockRedeem({ from: owner })
      expectEvent(trx, "RedeemUnlocked")

    })

    it("Test locking/unlocking redeem by not owner", async () => {
      await expectRevert(instance.lockRedeem({ from: randomUser }), "Ownable: caller is not the owner")
      await expectRevert(instance.unlockRedeem({ from: randomUser }), "Ownable: caller is not the owner")
    })
  })

  describe("Test calculateMintAmount", async () => {
    it("Test calculateMintAmount when balanceOf is 0", async () => {
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      await mockToken.givenMethodReturnUint(balanceOf, 0)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      const mintAmount = await instance.calculateMintAmount(1000)
      assert.equal(mintAmount.toNumber(), 1000000)
    })

    it("Test calculateMintAmount when balanceOf > 0", async () => {
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      await mockToken.givenMethodReturnUint(balanceOf, 9999)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      const mintAmount = await instance.calculateMintAmount(1000)
      assert.equal(mintAmount.toNumber(), 1000000)
    })

    it("Test calculateMintAmount when amount overflows", async () => {
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      await mockToken.givenMethodReturnUint(balanceOf, 1)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      await instance.mint(randomUser, 1)
      await expectRevert(instance.calculateMintAmount(constants.MAX_UINT256, { from: randomUser }), "AMOUNT_OVERFLOW")
    })

    it("Test calculateMintAmount when totalAmount overflows", async () => {
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      await mockToken.givenMethodReturnUint(balanceOf, constants.MAX_UINT256)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      await instance.mint(randomUser, 1)
      await expectRevert(instance.calculateMintAmount(1, { from: randomUser }), "TOTAL_AMOUNT_OVERFLOW")
    })

    it("Test calculateMintAmount when totalSupply overflows", async () => {
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      await mockToken.givenMethodReturnUint(balanceOf, 1)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      await instance.mint(randomUser, constants.MAX_UINT256)
      await expectRevert(instance.calculateMintAmount(1, { from: randomUser }), "TOTAL_SUPPLY_OVERFLOW")
    })

    it("Test calculateMintAmount returns expeted amount when total supply > 0", async () => {
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      await mockToken.givenMethodReturnUint(balanceOf, 9999)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      await instance.mint(randomUser, 900)
      // (1000/9999) * 900 = 90.0090009001 ~= 90
      const mintAmount = await instance.calculateMintAmount(1000, { from: randomUser })
      assert.equal(mintAmount.toNumber(), 90)
    })

    it("Test calculateMintAmount returns expeted amount when total supply is 0", async () => {
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      await mockToken.givenMethodReturnUint(balanceOf, 9999)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      // 90 * 1000 = 90000
      const mintAmount = await instance.calculateMintAmount(90, { from: randomUser })
      assert.equal(mintAmount.toNumber(), 90000)
    })
  })

  describe("Test getUnderlyerAmount", async () => {
    it("Test getUnderlyerAmount when amount overflows", async () => {
      await expectRevert(instance.getUnderlyerAmount.call(constants.MAX_UINT256), "AMOUNT_OVERFLOW")
    })

    it("Test getUnderlyerAmount when divide by zero", async () => {
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      await expectRevert(instance.getUnderlyerAmount.call(100), "INSUFFICIENT_TOTAL_SUPPLY")
    })

    it("Test getUnderlyerAmount when total supply overflows", async () => {
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      await instance.mint(randomUser, constants.MAX_UINT256)
      await expectRevert(instance.getUnderlyerAmount.call(100), "TOTAL_SUPPLY_OVERFLOW")
    })

    it("Test getUnderlyerAmount when underyler total overflows", async () => {
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      await mockToken.givenMethodReturnUint(balanceOf, constants.MAX_UINT256)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      await instance.mint(randomUser, 1)
      await expectRevert(instance.getUnderlyerAmount.call(1), "UNDERLYER_TOTAL_OVERFLOW")
    })

    it("Test getUnderlyerAmount", async () => {
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      await mockToken.givenMethodReturnUint(balanceOf, 1)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      await instance.mint(randomUser, 1)
      const underlyerAmount = await instance.getUnderlyerAmount.call(1)
      assert.equal(underlyerAmount.toNumber(), 1)
    })
  })
});
