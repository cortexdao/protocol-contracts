const { assert, expect } = require("chai");
const { ethers, artifacts } = require("hardhat");
const { defaultAbiCoder: abiCoder } = ethers.utils;
const timeMachine = require("ganache-time-traveler");
const {
  ZERO_ADDRESS,
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
} = require("../utils/helpers");

const IERC20 = new ethers.utils.Interface(
  artifacts.require(
    "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol:IERC20"
  ).abi
);
const ERC20 = new ethers.utils.Interface(
  artifacts.require(
    "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol:ERC20UpgradeSafe"
  ).abi
);

describe.only("Contract: APYPoolToken", () => {
  let deployer;
  let admin;
  let randomUser;

  let MockContract;
  let ProxyAdmin;
  let APYPoolTokenProxy;
  let APYPoolToken;

  let mockToken;
  let mockPriceAgg;
  let proxyAdmin;
  let logic;
  let proxy;
  let poolToken;

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
    [deployer, admin, randomUser] = await ethers.getSigners();

    MockContract = await ethers.getContractFactory("MockContract");
    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    APYPoolTokenProxy = await ethers.getContractFactory("APYPoolTokenProxy");
    APYPoolToken = await ethers.getContractFactory("TestAPYPoolToken");

    mockToken = await MockContract.deploy();
    await mockToken.deployed();
    mockPriceAgg = await MockContract.deploy();
    await mockPriceAgg.deployed();
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    logic = await APYPoolToken.deploy();
    await logic.deployed();
    proxy = await APYPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      mockToken.address,
      mockPriceAgg.address
    );
    await proxy.deployed();
    poolToken = await APYPoolToken.attach(proxy.address);
  });

  describe("Test Constructor", async () => {
    it("Test params invalid admin", async () => {
      await expect(
        APYPoolTokenProxy.deploy(
          logic.address,
          ZERO_ADDRESS,
          mockToken.address,
          mockPriceAgg.address
        )
      ).to.be.reverted;
    });

    it("Test params invalid token", async () => {
      await expect(
        APYPoolTokenProxy.deploy(
          logic.address,
          proxyAdmin.address,
          ZERO_ADDRESS,
          mockPriceAgg.address
        )
      ).to.be.reverted;
    });

    it("Test params invalid agg", async () => {
      await expect(
        APYPoolTokenProxy.deploy(
          logic.address,
          proxyAdmin.address,
          mockToken.address,
          ZERO_ADDRESS
        )
      ).to.be.reverted;
    });
  });

  describe("Defaults", async () => {
    it("Owner set to deployer", async () => {
      assert.equal(await poolToken.owner(), deployer.address);
    });

    it("DEFAULT_APT_TO_UNDERLYER_FACTOR set to correct value", async () => {
      assert.equal(await poolToken.DEFAULT_APT_TO_UNDERLYER_FACTOR(), 1000);
    });

    it("Name set to correct value", async () => {
      assert.equal(await poolToken.name(), "APY Pool Token");
    });

    it("Symbol set to correct value", async () => {
      assert.equal(await poolToken.symbol(), "APT");
    });

    it("Decimals set to correct value", async () => {
      assert.equal(await poolToken.decimals(), 18);
    });

    it("Block ether transfer", async () => {
      await expect(
        deployer.sendTransaction({ to: poolToken.address, value: "10" })
      ).to.be.revertedWith("DONT_SEND_ETHER");
    });
  });

  describe("Test setAdminAdddress", async () => {
    it("Test setAdminAddress pass", async () => {
      await poolToken.setAdminAddress(admin, { from: deployer });
      assert.equal(await poolToken.proxyAdmin.call(), admin);
    });

    it("Test setAdminAddress invalid admin", async () => {
      await expectRevert.unspecified(
        poolToken.setAdminAddress(ZERO_ADDRESS, { from: deployer })
      );
    });

    it("Test setAdminAddress fail", async () => {
      await expectRevert.unspecified(
        poolToken.setAdminAddress(admin, { from: randomUser })
      );
    });
  });

  describe("Test setPriceAggregator", async () => {
    it("Test addSupportedTokens with invalid agg", async () => {
      await expectRevert(
        poolToken.setPriceAggregator(ZERO_ADDRESS),
        "INVALID_AGG"
      );
    });

    it("Test setPriceAggregator when not owner", async () => {
      await expectRevert(
        poolToken.setPriceAggregator(FAKE_ADDRESS, {
          from: ANOTHER_FAKE_ADDRESS,
        }),
        "Ownable: caller is not the owner"
      );
    });

    it("Test setPriceAggregator pass", async () => {
      const newPriceAgg = await MockContract.new();
      const trx = await poolToken.setPriceAggregator(newPriceAgg.address);

      const priceAgg = await poolToken.priceAgg.call();

      assert.equal(priceAgg, newPriceAgg.address);
      await expectEvent(trx, "PriceAggregatorChanged", {
        agg: newPriceAgg.address,
      });
    });
  });

  describe("Test addLiquidity", async () => {
    it("Test addLiquidity insufficient amount", async () => {
      await expectRevert(poolToken.addLiquidity(0), "AMOUNT_INSUFFICIENT");
    });

    it("Test addLiquidity insufficient allowance", async () => {
      const allowance = IERC20.encodeFunctionData("allowance", [
        deployer,
        poolToken.address,
      ]);
      const mockAgg = await MockContract.new();
      await poolToken.setPriceAggregator(mockAgg.address);
      await mockToken.givenMethodReturnUint(allowance, 0);
      await expectRevert(poolToken.addLiquidity(1), "ALLOWANCE_INSUFFICIENT");
    });

    it("Test addLiquidity pass", async () => {
      const allowance = IERC20.encodeFunctionData("allowance", [
        randomUser,
        poolToken.address,
      ]);
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        poolToken.address,
      ]);
      const transferFrom = IERC20.encodeFunctionData("transferFrom", [
        randomUser,
        poolToken.address,
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

      await poolToken.setPriceAggregator(mockAgg.address);

      const trx = await poolToken.addLiquidity(1, {
        from: randomUser,
      });

      const balance = await poolToken.balanceOf(randomUser);
      assert.equal(balance.toNumber(), 1000);
      // this is the mint transfer
      await expectEvent(trx, "Transfer", {
        from: ZERO_ADDRESS,
        to: randomUser,
        value: new BN(1000),
      });
      await expectEvent(trx, "DepositedAPT", {
        sender: randomUser,
        token: mockToken.address,
        tokenAmount: new BN(1),
        aptMintAmount: new BN(1000),
        tokenEthValue: new BN(1),
        totalEthValueLocked: new BN(1),
      });
      const count = await mockToken.invocationCountForMethod.call(transferFrom);
      assert.equal(count, 1);
    });

    it("Test locking/unlocking addLiquidity by owner", async () => {
      const allowance = IERC20.encodeFunctionData("allowance", [
        randomUser,
        poolToken.address,
      ]);
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        poolToken.address,
      ]);
      const transferFrom = IERC20.encodeFunctionData("transferFrom", [
        randomUser,
        poolToken.address,
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

      await poolToken.setPriceAggregator(mockAgg.address);

      let trx = await poolToken.lockAddLiquidity({ from: deployer });
      await expectEvent(trx, "AddLiquidityLocked");

      await expectRevert(
        poolToken.addLiquidity(1, { from: randomUser }),
        "LOCKED"
      );

      trx = await poolToken.unlockAddLiquidity({ from: deployer });
      await expectEvent(trx, "AddLiquidityUnlocked");

      await poolToken.addLiquidity(1, { from: randomUser });
    });

    it("Test locking/unlocking addLiquidity by not owner", async () => {
      await expectRevert(
        poolToken.lockAddLiquidity({ from: randomUser }),
        "Ownable: caller is not the owner"
      );
      await expectRevert(
        poolToken.unlockAddLiquidity({ from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Test getPoolTotalEthValue", async () => {
    it("Test getPoolTotalEthValue returns expected", async () => {
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        poolToken.address,
      ]);

      mockToken.givenMethodReturnUint(balanceOf, 1);

      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 100, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await poolToken.setPriceAggregator(mockAgg.address);

      const val = await poolToken.getPoolTotalEthValue.call();
      assert.equal(val.toNumber(), 100);
    });
  });

  describe("Test getAPTEthValue", async () => {
    it("Test getAPTEthValue when insufficient total supply", async () => {
      await expectRevert(
        poolToken.getAPTEthValue(10),
        "INSUFFICIENT_TOTAL_SUPPLY"
      );
    });

    it("Test getAPTEthValue returns expected", async () => {
      await poolToken.mint(randomUser, 100);

      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        poolToken.address,
      ]);

      mockToken.givenMethodReturnUint(balanceOf, 1);

      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 100, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await poolToken.setPriceAggregator(mockAgg.address);

      const val = await poolToken.getAPTEthValue(10);
      assert.equal(val.toNumber(), 10);
    });
  });

  describe("Test getTokenAmountFromEthValue", async () => {
    it("Test getEthValueFromTokenAmount returns expected amount", async () => {
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 100, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      await poolToken.setPriceAggregator(mockAgg.address);
      // ((10 ^ 0) * 100) / 100
      const tokenAmount = await poolToken.getTokenAmountFromEthValue(100);
      assert.equal(tokenAmount.toNumber(), 1);
    });
  });

  describe("Test getEthValueFromTokenAmount", async () => {
    it("Test getEthValueFromTokenAmount returns 0 with 0 amount", async () => {
      const val = await poolToken.getEthValueFromTokenAmount(0);
      assert.equal(val.toNumber(), 0);
    });

    it("Test getEthValueFromTokenAmount returns expected amount", async () => {
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 100, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      await poolToken.setPriceAggregator(mockAgg.address);

      const val = await poolToken.getEthValueFromTokenAmount(1);
      assert.equal(val.toNumber(), 100);
    });
  });

  describe("Test getTokenEthPrice", async () => {
    it("Test getTokenEthPrice returns unexpected", async () => {
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 0, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await poolToken.setPriceAggregator(mockAgg.address);
      await expectRevert(
        poolToken.getTokenEthPrice.call(),
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

      await poolToken.setPriceAggregator(mockAgg.address);
      const price = await poolToken.getTokenEthPrice.call();
      assert.equal(price, 100);
    });
  });

  describe("Test redeem", async () => {
    it("Test redeem insufficient amount", async () => {
      await expectRevert(poolToken.redeem(0), "AMOUNT_INSUFFICIENT");
    });

    it("Test redeem insufficient balance", async () => {
      await poolToken.mint(randomUser, 1);
      await expectRevert(
        poolToken.redeem(2, { from: randomUser }),
        "BALANCE_INSUFFICIENT"
      );
    });

    it("Test redeem pass", async () => {
      await poolToken.mint(randomUser, 1000);

      const allowance = IERC20.encodeFunctionData("allowance", [
        randomUser,
        poolToken.address,
      ]);
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        poolToken.address,
      ]);
      const transfer = IERC20.encodeFunctionData("transfer", [randomUser, 1]);
      await mockToken.givenMethodReturnUint(allowance, 1);
      await mockToken.givenMethodReturnUint(balanceOf, 1);
      await mockToken.givenMethodReturnBool(transfer, true);

      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 1, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await poolToken.setPriceAggregator(mockAgg.address);

      const trx = await poolToken.redeem(1000, {
        from: randomUser,
      });

      const bal = await poolToken.balanceOf(randomUser);
      assert.equal(bal.toNumber(), 0);
      await expectEvent(trx, "Transfer", {
        from: randomUser,
        to: ZERO_ADDRESS,
        value: new BN(1000),
      });
      await expectEvent(trx, "RedeemedAPT", {
        sender: randomUser,
        token: mockToken.address,
        redeemedTokenAmount: new BN(1),
        aptRedeemAmount: new BN(1000),
        tokenEthValue: new BN(1),
        totalEthValueLocked: new BN(1),
        //this value is a lie, but it's due to token.balance() = 1 and mockAgg.getLastRound() = 1
      });
    });

    it("Test locking/unlocking redeem by owner", async () => {
      await poolToken.mint(randomUser, 100);
      const mockAgg = await MockContract.new();
      await poolToken.setPriceAggregator(mockAgg.address);

      let trx = await poolToken.lockRedeem({ from: deployer });
      expectEvent(trx, "RedeemLocked");

      await expectRevert(poolToken.redeem(50, { from: randomUser }), "LOCKED");

      trx = await poolToken.unlockRedeem({ from: deployer });
      expectEvent(trx, "RedeemUnlocked");
    });

    it("Test locking/unlocking contract by not owner", async () => {
      await poolToken.mint(randomUser, 100);
      const mockAgg = await MockContract.new();
      await poolToken.setPriceAggregator(mockAgg.address);

      let trx = await poolToken.lock({ from: deployer });
      expectEvent(trx, "Paused");

      await expectRevert(
        poolToken.redeem(50, { from: randomUser }),
        "Pausable: paused"
      );

      trx = await poolToken.unlock({ from: deployer });
      expectEvent(trx, "Unpaused");
    });

    it("Test locking/unlocking redeem by not owner", async () => {
      await expectRevert(
        poolToken.lockRedeem({ from: randomUser }),
        "Ownable: caller is not the owner"
      );
      await expectRevert(
        poolToken.unlockRedeem({ from: randomUser }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("Test calculateMintAmount", async () => {
    it("Test calculateMintAmount when token is 0 and total supply is 0", async () => {
      // total supply is 0

      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        poolToken.address,
      ]);
      await mockToken.givenMethodReturnUint(balanceOf, 0);

      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 1, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);

      await poolToken.setPriceAggregator(mockAgg.address);

      const mintAmount = await poolToken.calculateMintAmount(1000);
      assert.equal(mintAmount.toNumber(), 1000000);
    });

    it("Test calculateMintAmount when balanceOf > 0 and total supply is 0", async () => {
      // total supply is 0

      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        poolToken.address,
      ]);
      await mockToken.givenMethodReturnUint(balanceOf, 9999);
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 1, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      await poolToken.setPriceAggregator(mockAgg.address);

      const mintAmount = await poolToken.calculateMintAmount(1000);
      assert.equal(mintAmount.toNumber(), 1000000);
    });

    it("Test calculateMintAmount returns expeted amount when total supply > 0", async () => {
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        poolToken.address,
      ]);
      await mockToken.givenMethodReturnUint(balanceOf, 9999);
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 1, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      await poolToken.setPriceAggregator(mockAgg.address);

      await poolToken.mint(randomUser, 900);
      // (1000/9999) * 900 = 90.0090009001 ~= 90
      const mintAmount = await poolToken.calculateMintAmount(1000, {
        from: randomUser,
      });
      assert.equal(mintAmount.toNumber(), 90);
    });

    it("Test calculateMintAmount returns expeted amount when total supply is 0", async () => {
      const balanceOf = IERC20.encodeFunctionData("balanceOf", [
        poolToken.address,
      ]);
      await mockToken.givenMethodReturnUint(balanceOf, 9999);
      const returnData = abiCoder.encode(
        ["uint80", "int256", "uint256", "uint256", "uint80"],
        [0, 1, 0, 0, 0]
      );
      const mockAgg = await MockContract.new();
      await mockAgg.givenAnyReturn(returnData);
      await poolToken.setPriceAggregator(mockAgg.address);

      // 90 * 1000 = 90000
      const mintAmount = await poolToken.calculateMintAmount(90, {
        from: randomUser,
      });
      assert.equal(mintAmount.toNumber(), 90000);
    });
  });

  describe("Test getUnderlyerAmount", async () => {
    it("Test getUnderlyerAmount when divide by zero", async () => {
      await expectRevert(
        poolToken.getUnderlyerAmount.call(100),
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

      await poolToken.setPriceAggregator(mockAgg.address);
      await poolToken.mint(randomUser, 1);
      const underlyerAmount = await poolToken.getUnderlyerAmount.call("1");
      expect(underlyerAmount).to.bignumber.equal("1");
    });
  });
});
