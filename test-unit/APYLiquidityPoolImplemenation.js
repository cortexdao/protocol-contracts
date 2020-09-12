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
  const [owner, wallet, instanceAdmin, randomUser] = accounts;

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
  })

  describe("Test Setters", async () => {
    it("Test setAdminAddress pass", async () => {
      await instance.setAdminAddress(instanceAdmin, { from: owner })
      assert.equal(await instance.admin.call(), instanceAdmin)
    })

    it("Test setAdminAddress fail", async () => {
      await expectRevert.unspecified(
        instance.setAdminAddress(instanceAdmin, { from: randomUser })
      )
    })

    it("Test setUnderlyingAddress pass", async () => {
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
    })

    it("Test setUnderlyingAddress fail", async () => {
      await expectRevert.unspecified(
        instance.setUnderlyerAddress(mockToken.address, { from: randomUser })
      )
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

    it("Test calculateMintAmount returns expeted amount", async () => {
      const balanceOf = DAI.interface.encodeFunctionData('balanceOf', [instance.address])
      await mockToken.givenMethodReturnUint(balanceOf, 9999)
      await instance.setUnderlyerAddress(mockToken.address, { from: owner })
      await instance.mint(randomUser, 900)
      // (1000/9999) * 900 = 90.0090009001 ~= 90
      const mintAmount = await instance.calculateMintAmount(1000, { from: randomUser })
      assert.equal(mintAmount.toNumber(), 90)
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

  // it("addLiquidity reverts if 0 DAI sent", async () => {
  //   await expectRevert(
  //     instance.addLiquidity(0, { from: wallet, value: "0" }),
  //     "Pool/insufficient-value"
  //   );
  // });

  //   it("mint amount to supply equals DAI deposit to total DAI balance", async () => {
  //     const daiDeposit = dai("112");
  //     const totalBalance = dai("1000000");
  //     // set total supply to total Dai balance
  //     await pool.internalMint(pool.address, totalBalance);
  //     // set tolerance to compensate for fixed-point arithmetic
  //     const tolerance = new BN("50000");

  //     let mintAmount = await pool.internalCalculateMintAmount(
  //       daiDeposit,
  //       totalBalance,
  //       { from: wallet }
  //     );
  //     let expectedAmount = daiDeposit;
  //     expect(mintAmount.sub(expectedAmount).abs()).to.bignumber.lte(
  //       tolerance,
  //       "mint amount should differ from expected amount by at most tolerance"
  //     );

  //     await pool.internalBurn(pool.address, totalBalance.divn(2));

  //     mintAmount = await pool.internalCalculateMintAmount(
  //       daiDeposit,
  //       totalBalance,
  //       { from: wallet }
  //     );
  //     expectedAmount = daiDeposit.divn(2);
  //     expect(mintAmount.sub(expectedAmount).abs()).to.bignumber.lte(
  //       tolerance,
  //       "mint amount should differ from expected amount by at most tolerance"
  //     );
  //   });

  //   it("mint amount is constant multiple of deposit if total Dai balance is zero", async () => {
  //     // set non-zero total supply
  //     await pool.internalMint(pool.address, dai("100"));

  //     const daiDeposit = dai("7.3");
  //     const mintAmount = await pool.internalCalculateMintAmount(daiDeposit, 0, {
  //       from: wallet,
  //     });
  //     expect(mintAmount).to.bignumber.equal(
  //       daiDeposit.mul(DEFAULT_APT_TO_UNDERLYER_FACTOR)
  //     );
  //   });

  //   it("mint amount is constant multiple of deposit if total supply is zero ", async () => {
  //     const daiDeposit = dai("5");
  //     const totalBalance = dai("100");
  //     const mintAmount = await pool.internalCalculateMintAmount(
  //       daiDeposit,
  //       totalBalance,
  //       { from: wallet }
  //     );
  //     expect(mintAmount).to.bignumber.equal(
  //       daiDeposit.mul(DEFAULT_APT_TO_UNDERLYER_FACTOR)
  //     );
  //   });

  //   it("addLiquidity will create APT for sender", async () => {
  //     let balanceOf = await pool.balanceOf(wallet);
  //     expect(balanceOf).to.bignumber.equal("0");

  //     const daiDeposit = dai("1");
  //     await mockDaiTransfer(pool, daiDeposit);

  //     await pool.addLiquidity(daiDeposit, {
  //       from: wallet,
  //     });
  //     balanceOf = await pool.balanceOf(wallet);
  //     expect(balanceOf).to.bignumber.gt("0");
  //   });

  //   it("addLiquidity creates correctly calculated amount of APT", async () => {
  //     await mockDaiTransfer(pool, dai("10"));
  //     // use another account to call addLiquidity and create non-zero
  //     // token supply and ETH value in contract
  //     await pool.addLiquidity(dai("10"), {
  //       from: other,
  //     });

  //     // now we can check the expected mint amount based on the ETH ratio
  //     const daiDeposit = ether("2");
  //     const expectedMintAmount = await pool.calculateMintAmount(daiDeposit, {
  //       from: wallet,
  //     });

  //     await pool.addLiquidity(daiDeposit, { from: wallet });
  //     const mintAmount = await pool.balanceOf(wallet);
  //     expect(mintAmount).to.bignumber.equal(expectedMintAmount);
  //   });

  //   it("redeem reverts if amount is zero", async () => {
  //     await expectRevert(pool.redeem(0), "Pool/redeem-positive-amount");
  //   });

  //   it("redeem reverts if insufficient balance", async () => {
  //     const tokenBalance = new BN("100");
  //     await pool.internalMint(wallet, tokenBalance);

  //     await expectRevert(
  //       pool.redeem(tokenBalance.addn(1), { from: wallet }),
  //       "Pool/insufficient-balance"
  //     );
  //   });

  //   it("redeem burns specified token amount", async () => {
  //     // start wallet with APT
  //     const startAmount = dai("2");
  //     await pool.internalMint(wallet, startAmount);

  //     const redeemAmount = dai("1");
  //     await mockDaiTransfer(pool, redeemAmount);

  //     await pool.redeem(redeemAmount, { from: wallet });
  //     expect(await pool.balanceOf(wallet)).to.bignumber.equal(
  //       startAmount.sub(redeemAmount)
  //     );
  //   });

  //   it("redeem undoes addLiquidity", async () => {
  //     const daiDeposit = ether("1");
  //     await mockDaiTransfer(pool, daiDeposit);
  //     await pool.addLiquidity(daiDeposit, { from: wallet });

  //     const mintAmount = await pool.balanceOf(wallet);
  //     await pool.redeem(mintAmount, { from: wallet });
  //     expect(await pool.balanceOf(wallet)).to.bignumber.equal("0");
  //   });

  //   // test helper to mock ERC20 functions on underlyer token
  //   const mockDaiTransfer = async (liquidityPoolContract, amount) => {
  //     const mock = await MockContract.new();
  //     await liquidityPoolContract.setUnderlyerAddress(mock.address, {
  //       from: deployer,
  //     });
  //     const allowanceAbi = pool.contract.methods
  //       .allowance(ZERO_ADDRESS, ZERO_ADDRESS)
  //       .encodeABI();
  //     const transferFromAbi = pool.contract.methods
  //       .transferFrom(ZERO_ADDRESS, ZERO_ADDRESS, 0)
  //       .encodeABI();
  //     const transferAbi = pool.contract.methods
  //       .transfer(ZERO_ADDRESS, 0)
  //       .encodeABI();
  //     await mock.givenMethodReturnUint(allowanceAbi, amount);
  //     await mock.givenMethodReturnBool(transferAbi, true);
  //     await mock.givenMethodReturnBool(transferFromAbi, true);
  //   };
});
