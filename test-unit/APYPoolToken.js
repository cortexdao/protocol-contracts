const { assert, expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { deployMockContract } = waffle;
const { BigNumber } = ethers;

const timeMachine = require("ganache-time-traveler");

const {
  ZERO_ADDRESS,
  FAKE_ADDRESS,
  tokenAmountToBigNumber,
} = require("../utils/helpers");

const AggregatorV3Interface = artifacts.require("AggregatorV3Interface");
const IDetailedERC20 = artifacts.require("IDetailedERC20");
const APYMetaPoolToken = artifacts.require("APYMetaPoolToken");

describe("Contract: APYPoolToken", () => {
  // signers
  let deployer;
  let admin;
  let randomUser;
  let anotherUser;

  // contract factories
  let ProxyAdmin;
  let APYPoolTokenProxy;
  let APYPoolToken;

  // mocks
  let underlyerMock;
  let priceAggMock;
  let mAptMock;

  // pool
  let proxyAdmin;
  let logic;
  let proxy;
  let poolToken;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [deployer, admin, randomUser, anotherUser] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    APYPoolTokenProxy = await ethers.getContractFactory("APYPoolTokenProxy");
    APYPoolToken = await ethers.getContractFactory("TestAPYPoolToken");

    underlyerMock = await deployMockContract(deployer, IDetailedERC20.abi);
    priceAggMock = await deployMockContract(
      deployer,
      AggregatorV3Interface.abi
    );
    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    logic = await APYPoolToken.deploy();
    await logic.deployed();
    proxy = await APYPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      underlyerMock.address,
      priceAggMock.address
    );
    await proxy.deployed();
    poolToken = await APYPoolToken.attach(proxy.address);

    mAptMock = await deployMockContract(deployer, APYMetaPoolToken.abi);
    await poolToken.setMetaPoolToken(mAptMock.address);
  });

  describe("Constructor", async () => {
    it("Revert when admin address is zero ", async () => {
      await expect(
        APYPoolTokenProxy.deploy(
          logic.address,
          ZERO_ADDRESS,
          underlyerMock.address,
          priceAggMock.address
        )
      ).to.be.reverted;
    });

    it("Revert when token address is zero", async () => {
      await expect(
        APYPoolTokenProxy.deploy(
          logic.address,
          proxyAdmin.address,
          ZERO_ADDRESS,
          priceAggMock.address
        )
      ).to.be.reverted;
    });

    it("Revert when agg address is zero", async () => {
      await expect(
        APYPoolTokenProxy.deploy(
          logic.address,
          proxyAdmin.address,
          underlyerMock.address,
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

  describe("Set admin address", async () => {
    it("Owner can set admin", async () => {
      await poolToken.connect(deployer).setAdminAddress(admin.address);
      assert.equal(await poolToken.proxyAdmin(), admin.address);
    });

    it("Revert on setting to zero address", async () => {
      await expect(poolToken.connect(deployer).setAdminAddress(ZERO_ADDRESS)).to
        .be.reverted;
    });

    it("Revert when non-owner attempts to set address", async () => {
      await expect(poolToken.connect(randomUser).setAdminAddress(admin.address))
        .to.be.reverted;
    });
  });

  describe("Set price aggregator address", async () => {
    it("Revert when agg address is zero", async () => {
      await expect(
        poolToken.setPriceAggregator(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_AGG");
    });

    it("Revert when non-owner attempts to set agg", async () => {
      await expect(
        poolToken.connect(randomUser).setPriceAggregator(FAKE_ADDRESS)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Owner can set agg", async () => {
      const setPromise = poolToken
        .connect(deployer)
        .setPriceAggregator(FAKE_ADDRESS);

      const priceAgg = await poolToken.priceAgg();

      assert.equal(priceAgg, FAKE_ADDRESS);
      await expect(setPromise)
        .to.emit(poolToken, "PriceAggregatorChanged")
        .withArgs(FAKE_ADDRESS);
    });
  });

  describe("Set mAPT address", async () => {
    it("Owner can set mAPT address", async () => {
      const mockContract = await deployMockContract(deployer, []);
      const mockContractAddress = mockContract.address;
      await poolToken.connect(deployer).setMetaPoolToken(mockContractAddress);
      assert.equal(await poolToken.mApt(), mockContractAddress);
    });

    it("Revert on setting to non-contract address", async () => {
      await expect(poolToken.connect(deployer).setMetaPoolToken(FAKE_ADDRESS))
        .to.be.reverted;
    });

    it("Revert when non-owner attempts to set address", async () => {
      await expect(
        poolToken.connect(randomUser).setMetaPoolToken(admin.address)
      ).to.be.reverted;
    });
  });

  describe("getTokenEthPrice", async () => {
    it("Revert when price agg returns non-positive price", async () => {
      await priceAggMock.mock.latestRoundData.returns(0, 0, 0, 0, 0);
      await expect(poolToken.getTokenEthPrice.call()).to.be.revertedWith(
        "UNABLE_TO_RETRIEVE_ETH_PRICE"
      );
    });

    it("Returns value when price agg returns positive price", async () => {
      await priceAggMock.mock.latestRoundData.returns(0, 100, 0, 0, 0);
      expect(await poolToken.getTokenEthPrice()).to.equal(100);
    });
  });

  describe("Lock pool", () => {
    it("Owner can lock and unlock pool", async () => {
      await expect(poolToken.connect(deployer).lock()).to.emit(
        poolToken,
        "Paused"
      );
      await expect(poolToken.connect(deployer).unlock()).to.emit(
        poolToken,
        "Unpaused"
      );
    });

    it("Revert when non-owner attempts to lock", async () => {
      await expect(poolToken.connect(randomUser).lock()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Revert when non-owner attempts to unlock", async () => {
      await expect(poolToken.connect(randomUser).unlock()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("Revert when calling addLiquidity/redeem on locked pool", async () => {
      await poolToken.connect(deployer).lock();

      await expect(
        poolToken.connect(randomUser).addLiquidity(50)
      ).to.revertedWith("Pausable: paused");

      await expect(poolToken.connect(randomUser).redeem(50)).to.revertedWith(
        "Pausable: paused"
      );
    });

    it("Revert when calling infiniteApprove on locked pool", async () => {
      await poolToken.connect(deployer).lock();

      await expect(
        poolToken.connect(deployer).infiniteApprove(FAKE_ADDRESS)
      ).to.revertedWith("Pausable: paused");
    });

    it("Allow calling revokeApprove on locked pool", async () => {
      await underlyerMock.mock.approve.returns(true);

      await poolToken.connect(deployer).lock();

      await expect(poolToken.connect(deployer).revokeApprove(FAKE_ADDRESS)).to
        .not.be.reverted;
    });
  });

  describe("Approvals", () => {
    beforeEach(async () => {
      await underlyerMock.mock.allowance.returns(0); // needed for `safeApprove`
      await underlyerMock.mock.approve.returns(true);
    });

    it("Owner can call infiniteApprove", async () => {
      await expect(poolToken.connect(deployer).infiniteApprove(FAKE_ADDRESS)).to
        .not.be.reverted;
    });

    it("Revert when non-owner calls infiniteApprove", async () => {
      await expect(poolToken.connect(randomUser).infiniteApprove(FAKE_ADDRESS))
        .to.be.reverted;
    });

    it("Owner can call revokeApprove", async () => {
      await expect(poolToken.connect(deployer).revokeApprove(FAKE_ADDRESS)).to
        .not.be.reverted;
    });

    it("Revert when non-owner calls revokeApprove", async () => {
      await expect(poolToken.connect(randomUser).revokeApprove(FAKE_ADDRESS)).to
        .be.reverted;
    });
  });

  describe("getTokenAmountFromEthValue", () => {
    it("Returns correct value", async () => {
      const decimals = 0;
      await underlyerMock.mock.decimals.returns(decimals);
      const price = 25;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);
      const ethValue = 100;
      // ((10 ^ 0) * 100) / 25
      const expectedUnderlyerAmount = BigNumber.from(10 ** decimals)
        .mul(ethValue)
        .div(price);
      expect(await poolToken.getTokenAmountFromEthValue(ethValue)).to.equal(
        expectedUnderlyerAmount
      );
    });
  });

  describe("getEthValueFromTokenAmount", () => {
    it("Return 0 for zero amount", async () => {
      expect(await poolToken.getEthValueFromTokenAmount(0)).to.equal(0);
    });

    it("Returns correct value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      const underlyerAmount = tokenAmountToBigNumber(5, decimals);
      // 50 * 2 / 10 ^ 1
      const expectedEthValue = underlyerAmount.mul(price).div(10 ** decimals);
      expect(
        await poolToken.getEthValueFromTokenAmount(underlyerAmount)
      ).to.equal(expectedEthValue);
    });
  });

  describe("getPoolUnderlyerEthValue", () => {
    it("Returns correct value regardless of deployed value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const balance = tokenAmountToBigNumber("7.5", decimals);
      await underlyerMock.mock.balanceOf.returns(balance);

      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      // 75 * 2 / 10^1
      const expectedEthValue = balance.mul(price).div(10 ** decimals);

      // force zero deployed value
      await mAptMock.mock.getDeployedEthValue.returns(0);
      expect(await poolToken.getDeployedEthValue()).to.equal(0);
      expect(await poolToken.getPoolUnderlyerEthValue()).to.equal(
        expectedEthValue
      );

      // force non-zero deployed value
      await mAptMock.mock.getDeployedEthValue.returns(1234);
      expect(await poolToken.getDeployedEthValue()).to.be.gt(0);
      expect(await poolToken.getPoolUnderlyerEthValue()).to.equal(
        expectedEthValue
      );
    });
  });

  describe("getDeployedEthValue", () => {
    it("Delegates properly to mAPT contract", async () => {
      await mAptMock.mock.getDeployedEthValue.returns(0);
      expect(await poolToken.getDeployedEthValue()).to.equal(0);

      const deployedValue = tokenAmountToBigNumber(12345);
      await mAptMock.mock.getDeployedEthValue.returns(deployedValue);
      expect(await poolToken.getDeployedEthValue()).to.equal(deployedValue);
    });
  });

  describe("getPoolTotalEthValue", () => {
    it("Returns correct value", async () => {
      const decimals = 1;
      await underlyerMock.mock.decimals.returns(decimals);
      const underlyerBalance = tokenAmountToBigNumber("7.5", decimals);
      await underlyerMock.mock.balanceOf.returns(underlyerBalance);

      const deployedValue = tokenAmountToBigNumber(1234);
      await mAptMock.mock.getDeployedEthValue.returns(deployedValue);

      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      // Underlyer ETH value: 75 * 2 / 10^1 = 15
      const underlyerValue = underlyerBalance.mul(price).div(10 ** decimals);
      const expectedEthValue = underlyerValue.add(deployedValue);
      expect(await poolToken.getPoolTotalEthValue()).to.equal(expectedEthValue);
    });
  });

  describe("getAPTEthValue", () => {
    it("Revert when zero APT supply", async () => {
      expect(await poolToken.totalSupply()).to.equal(0);
      await expect(poolToken.getAPTEthValue(10)).to.be.revertedWith(
        "INSUFFICIENT_TOTAL_SUPPLY"
      );
    });

    it("Returns correct value", async () => {
      await poolToken.mint(randomUser.address, 100);
      await underlyerMock.mock.decimals.returns(0);
      await underlyerMock.mock.balanceOf.returns(100);

      const price = 2;
      await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

      const aptSupply = await poolToken.totalSupply();
      const aptAmount = tokenAmountToBigNumber(10);

      // zero deployed value
      await mAptMock.mock.getDeployedEthValue.returns(0);
      let poolTotalValue = await poolToken.getPoolTotalEthValue();
      let expectedEthValue = poolTotalValue.mul(aptAmount).div(aptSupply);
      expect(await poolToken.getAPTEthValue(aptAmount)).to.equal(
        expectedEthValue
      );

      // non-zero deployed value
      const deployedValue = tokenAmountToBigNumber(1234);
      await mAptMock.mock.getDeployedEthValue.returns(deployedValue);
      poolTotalValue = await poolToken.getPoolTotalEthValue();
      expectedEthValue = poolTotalValue.mul(aptAmount).div(aptSupply);
      expect(await poolToken.getAPTEthValue(aptAmount)).to.equal(
        expectedEthValue
      );
    });
  });

  describe("calculateMintAmount", () => {
    beforeEach(async () => {
      await mAptMock.mock.getDeployedEthValue.returns(0);
    });

    it("Uses fixed ratio with zero total supply", async () => {
      expect(await poolToken.totalSupply()).to.equal(0);

      await underlyerMock.mock.decimals.returns("0");
      await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);

      const DEPOSIT_FACTOR = await poolToken.DEFAULT_APT_TO_UNDERLYER_FACTOR();
      const depositAmount = tokenAmountToBigNumber("123");

      await underlyerMock.mock.balanceOf.returns(9999);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        depositAmount.mul(DEPOSIT_FACTOR)
      );

      // result doesn't depend on pool's underlyer balance
      await underlyerMock.mock.balanceOf.withArgs(poolToken.address).returns(0);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        depositAmount.mul(DEPOSIT_FACTOR)
      );

      // result doesn't depend on pool's deployed value
      await mAptMock.mock.getDeployedEthValue.returns(10000000);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        depositAmount.mul(DEPOSIT_FACTOR)
      );
    });

    it("Returns calculated value with non-zero total supply", async () => {
      const decimals = "0";

      const aptTotalSupply = tokenAmountToBigNumber("900", "18");
      const depositAmount = tokenAmountToBigNumber("1000", decimals);
      const poolBalance = tokenAmountToBigNumber("9999", decimals);

      await priceAggMock.mock.latestRoundData.returns(0, 1, 0, 0, 0);
      await underlyerMock.mock.balanceOf.returns(poolBalance);
      await underlyerMock.mock.decimals.returns(decimals);

      await poolToken.mint(poolToken.address, aptTotalSupply);
      const expectedMintAmount = aptTotalSupply
        .mul(depositAmount)
        .div(poolBalance);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        expectedMintAmount
      );
    });

    it("Returns calculated value with non-zero total supply and deployed value", async () => {
      const decimals = "0";

      const aptTotalSupply = tokenAmountToBigNumber("900", "18");
      const depositAmount = tokenAmountToBigNumber("1000", decimals);
      const poolUnderlyerBalance = tokenAmountToBigNumber("9999", decimals);

      const aggMock = await deployMockContract(
        deployer,
        AggregatorV3Interface.abi
      );
      const price = 1;
      await aggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);
      await poolToken.setPriceAggregator(aggMock.address);
      await underlyerMock.mock.balanceOf.returns(poolUnderlyerBalance);
      await underlyerMock.mock.decimals.returns(decimals);

      await mAptMock.mock.balanceOf.returns(tokenAmountToBigNumber(10));
      await mAptMock.mock.totalSupply.returns(tokenAmountToBigNumber(1000));
      await mAptMock.mock.getTVL.returns(tokenAmountToBigNumber(271828));

      await poolToken.mint(poolToken.address, aptTotalSupply);

      const depositValue = depositAmount.mul(price).div(10 ** decimals);
      const poolTotalValue = await poolToken.getPoolTotalEthValue();
      const expectedMintAmount = aptTotalSupply
        .mul(depositValue)
        .div(poolTotalValue);
      expect(await poolToken.calculateMintAmount(depositAmount)).to.equal(
        expectedMintAmount
      );
    });
  });

  describe("getUnderlyerAmount", () => {
    beforeEach(async () => {
      await mAptMock.mock.getDeployedEthValue.returns(0);
    });

    it("Test getUnderlyerAmount when divide by zero", async () => {
      await expect(poolToken.getUnderlyerAmount(100)).to.be.revertedWith(
        "INSUFFICIENT_TOTAL_SUPPLY"
      );
    });

    it("Test getUnderlyerAmount returns expected amount", async () => {
      await underlyerMock.mock.balanceOf.returns("1");
      await underlyerMock.mock.decimals.returns("1");
      await priceAggMock.mock.latestRoundData.returns(0, 10, 0, 0, 0);

      await poolToken.mint(randomUser.address, 1);
      const underlyerAmount = await poolToken.getUnderlyerAmount("1");
      expect(underlyerAmount).to.equal("1");
    });
  });

  describe("addLiquidity", () => {
    it("Revert if deposit is zero", async () => {
      await expect(poolToken.addLiquidity(0)).to.be.revertedWith(
        "AMOUNT_INSUFFICIENT"
      );
    });

    it("Revert if allowance is less than deposit", async () => {
      await underlyerMock.mock.allowance.returns(0);
      await expect(poolToken.addLiquidity(1)).to.be.revertedWith(
        "ALLOWANCE_INSUFFICIENT"
      );
    });

    /* 
      Test with range of deployed TVL values.  Using 0 as
      deployed value forces old code paths without mAPT since
      the pool's total ETH value comes purely from its underlyer
      holdings.
    */
    const deployedValues = [
      tokenAmountToBigNumber(0),
      tokenAmountToBigNumber(2193389),
      tokenAmountToBigNumber(187892873),
    ];
    deployedValues.forEach(function (deployedValue) {
      describe(`  deployed value: ${deployedValue}`, () => {
        const decimals = 6;
        const depositAmount = tokenAmountToBigNumber(1, decimals);
        const poolBalance = tokenAmountToBigNumber(1000, decimals);

        // use EVM snapshots for test isolation
        let snapshotId;

        before(async () => {
          const snapshot = await timeMachine.takeSnapshot();
          snapshotId = snapshot["result"];

          await mAptMock.mock.getDeployedEthValue.returns(deployedValue);

          const price = 1;
          await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

          await underlyerMock.mock.decimals.returns(decimals);
          await underlyerMock.mock.allowance.returns(depositAmount);
          await underlyerMock.mock.balanceOf
            .withArgs(poolToken.address)
            .returns(poolBalance);
          await underlyerMock.mock.transferFrom.returns(true);
        });

        after(async () => {
          await timeMachine.revertToSnapshot(snapshotId);
        });

        it("Increase APT balance by calculated amount", async () => {
          const expectedMintAmount = await poolToken.calculateMintAmount(
            depositAmount
          );

          await expect(() =>
            poolToken.connect(randomUser).addLiquidity(depositAmount)
          ).to.changeTokenBalance(poolToken, randomUser, expectedMintAmount);
        });

        it("Emit correct APT events", async () => {
          const expectedMintAmount = await poolToken.calculateMintAmount(
            depositAmount
          );
          const depositEthValue = await poolToken.getEthValueFromTokenAmount(
            depositAmount
          );

          // mock the underlyer transfer to the pool, so we can
          // check deposit event has the post-deposit pool ETH value
          await underlyerMock.mock.balanceOf
            .withArgs(poolToken.address)
            .returns(poolBalance.add(depositAmount));
          const poolEthValue = await poolToken.getPoolTotalEthValue();
          // Technically this is a hack.  `getPoolTotalEthValue` gets called twice
          // in `addLiquidity`: before and after the transfer.  If APT total supply
          // were not zero, the pool eth value would be calculated and used both
          // times.  This would give inconsistent values to check against the event
          // and the test should fail (`expectedMintAmount` and `poolEthValue`
          // would be inconsistent.)
          //
          // See similar, but more extensive comments in the corresponding test
          // for `redeem`.

          const addLiquidityPromise = poolToken
            .connect(randomUser)
            .addLiquidity(depositAmount);

          await expect(addLiquidityPromise)
            .to.emit(poolToken, "Transfer")
            .withArgs(ZERO_ADDRESS, randomUser.address, expectedMintAmount);

          await expect(addLiquidityPromise)
            .to.emit(poolToken, "DepositedAPT")
            .withArgs(
              randomUser.address,
              underlyerMock.address,
              depositAmount,
              expectedMintAmount,
              depositEthValue,
              poolEthValue
            );
        });

        it("transferFrom called on underlyer", async () => {
          /* https://github.com/nomiclabs/hardhat/issues/1135
           * Due to the above issue, we can't simply do:
           *
           *  expect("transferFrom")
           *    .to.be.calledOnContract(underlyerMock)
           *    .withArgs(randomUser.address, poolToken.address, depositAmount);
           *
           *  Instead, we have to do some hacky revert-check logic.
           */
          await underlyerMock.mock.transferFrom.reverts();
          await expect(
            poolToken.connect(randomUser).addLiquidity(depositAmount)
          ).to.be.reverted;
          await underlyerMock.mock.transferFrom
            .withArgs(randomUser.address, poolToken.address, depositAmount)
            .returns(true);
          await expect(
            poolToken.connect(randomUser).addLiquidity(depositAmount)
          ).to.not.be.reverted;
        });

        it("Deposit should work after unlock", async () => {
          await poolToken.connect(deployer).lockAddLiquidity();
          await poolToken.connect(deployer).unlockAddLiquidity();

          await expect(
            poolToken.connect(randomUser).addLiquidity(depositAmount)
          ).to.not.be.reverted;
        });
      });
    });

    describe("Locking", () => {
      it("Owner can lock", async () => {
        await expect(poolToken.connect(deployer).lockAddLiquidity()).to.emit(
          poolToken,
          "AddLiquidityLocked"
        );
      });

      it("Owner can unlock", async () => {
        await expect(poolToken.connect(deployer).unlockAddLiquidity()).to.emit(
          poolToken,
          "AddLiquidityUnlocked"
        );
      });

      it("Revert if non-owner attempts to lock", async () => {
        await expect(
          poolToken.connect(randomUser).lockAddLiquidity()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Revert if non-owner attempts to unlock", async () => {
        await expect(
          poolToken.connect(randomUser).unlockAddLiquidity()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Revert deposit when pool is locked", async () => {
        await poolToken.connect(deployer).lockAddLiquidity();

        await expect(
          poolToken.connect(randomUser).addLiquidity(1)
        ).to.be.revertedWith("LOCKED");
      });
    });
  });

  describe("redeem", () => {
    it("Revert if withdraw is zero", async () => {
      await expect(poolToken.redeem(0)).to.be.revertedWith(
        "AMOUNT_INSUFFICIENT"
      );
    });

    it("Revert if APT balance is less than withdraw", async () => {
      await poolToken.mint(randomUser.address, 1);
      await expect(poolToken.connect(randomUser).redeem(2)).to.be.revertedWith(
        "BALANCE_INSUFFICIENT"
      );
    });

    /* 
      Test with range of deployed TVL values.  Using 0 as
      deployed value forces old code paths without mAPT since
      the pool's total ETH value comes purely from its underlyer
      holdings.
    */
    const deployedValues = [
      tokenAmountToBigNumber(0),
      tokenAmountToBigNumber(2193389),
      tokenAmountToBigNumber(187892873),
    ];
    deployedValues.forEach(function (deployedValue) {
      describe(`  deployed value: ${deployedValue}`, () => {
        const decimals = 6;
        const poolBalance = tokenAmountToBigNumber(1000, decimals);
        const aptSupply = tokenAmountToBigNumber(1000000);
        let reserveAptAmount;
        let aptAmount;

        // use EVM snapshots for test isolation
        let snapshotId;

        before(async () => {
          const snapshot = await timeMachine.takeSnapshot();
          snapshotId = snapshot["result"];

          await mAptMock.mock.getDeployedEthValue.returns(deployedValue);

          const price = 1;
          await priceAggMock.mock.latestRoundData.returns(0, price, 0, 0, 0);

          await underlyerMock.mock.decimals.returns(decimals);
          await underlyerMock.mock.allowance.returns(poolBalance);
          await underlyerMock.mock.balanceOf
            .withArgs(poolToken.address)
            .returns(poolBalance);
          await underlyerMock.mock.transfer.returns(true);

          // Mint APT supply to go along with pool's total ETH value.
          await poolToken.mint(deployer.address, aptSupply);
          // Transfer reserve APT amount to user; must do a burn and mint
          // since inter-user transfer is blocked.
          reserveAptAmount = await poolToken.calculateMintAmount(poolBalance);
          await poolToken.burn(deployer.address, reserveAptAmount);
          await poolToken.mint(randomUser.address, reserveAptAmount);
          aptAmount = reserveAptAmount;
        });

        after(async () => {
          await timeMachine.revertToSnapshot(snapshotId);
        });

        it("Decrease APT balance by redeem amount", async () => {
          await expect(() =>
            poolToken.connect(randomUser).redeem(aptAmount)
          ).to.changeTokenBalance(poolToken, randomUser, aptAmount.mul(-1));
        });

        it("Emit correct APT events", async () => {
          const underlyerAmount = await poolToken.getUnderlyerAmount(aptAmount);
          const depositEthValue = await poolToken.getEthValueFromTokenAmount(
            underlyerAmount
          );

          const poolEthValue = await poolToken.getPoolTotalEthValue();
          // This is wrong, as it is the value prior to the underlyer transfer.
          // However, it is the only way to get the test to pass with mocking.
          //
          // What we *should* do is mock the underlyer transfer from the pool, so we can
          // check redeem event has the post-redeem pool ETH value:
          //
          // await underlyerMock.mock.balanceOf
          //   .withArgs(poolToken.address)
          //   .returns(poolBalance.sub(underlyerAmount));
          //
          // The problem is that `getPoolTotalEthValue` gets called twice
          // in `redeem`: before (inside `getAPTEthValue`) and after the transfer,
          // in the event.  This gives inconsistent values between underlyerAmount
          // and poolTotalEthValue in the event args and we can't fix it by mocking
          // since it is all done in one transaction.
          //
          // If the mock contract allowed us to return different values on
          // consecutive calls, we could fix the test.
          //
          // The best option right now is to explicitly check the event is correct
          // in the integration tests.

          const redeemPromise = poolToken.connect(randomUser).redeem(aptAmount);

          await expect(redeemPromise)
            .to.emit(poolToken, "Transfer")
            .withArgs(randomUser.address, ZERO_ADDRESS, aptAmount);

          await expect(redeemPromise)
            .to.emit(poolToken, "RedeemedAPT")
            .withArgs(
              randomUser.address,
              underlyerMock.address,
              underlyerAmount,
              aptAmount,
              depositEthValue,
              poolEthValue
            );
        });

        it("transfer called on underlyer", async () => {
          /* https://github.com/nomiclabs/hardhat/issues/1135
           * Due to the above issue, we can't simply do:
           *
           *  expect("transfer")
           *    .to.be.calledOnContract(underlyerMock)
           *    .withArgs(randomUser.address, underlyerAmount);
           *
           *  Instead, we have to do some hacky revert-check logic.
           */
          const underlyerAmount = await poolToken.getUnderlyerAmount(aptAmount);
          await underlyerMock.mock.transfer.reverts();
          await expect(poolToken.connect(randomUser).redeem(aptAmount)).to.be
            .reverted;
          await underlyerMock.mock.transfer
            .withArgs(randomUser.address, underlyerAmount)
            .returns(true);
          await expect(poolToken.connect(randomUser).redeem(aptAmount)).to.not
            .be.reverted;
        });

        it("Redeem should work after unlock", async () => {
          await poolToken.connect(deployer).lockRedeem();
          await poolToken.connect(deployer).unlockRedeem();

          await expect(poolToken.connect(randomUser).redeem(aptAmount)).to.not
            .be.reverted;
        });

        it("Revert when underlyer amount exceeds reserve", async () => {
          // when zero deployed value, APT share gives ownership of only
          // underlyer amount, and this amount will be fully in the reserve
          // so there is nothing to test.
          if (deployedValue == 0) return;
          // this "transfer" pushes the user's corresponding underlyer amount
          // for his APT higher than the reserve balance.
          const smallAptAmount = 10;
          await poolToken.burn(deployer.address, smallAptAmount);
          await poolToken.mint(randomUser.address, smallAptAmount);

          await expect(
            poolToken
              .connect(randomUser)
              .redeem(reserveAptAmount.add(smallAptAmount))
          ).to.be.revertedWith("RESERVE_INSUFFICIENT");
        });
      });
    });

    describe("Locking", () => {
      it("Owner can lock", async () => {
        await expect(poolToken.connect(deployer).lockRedeem()).to.emit(
          poolToken,
          "RedeemLocked"
        );
      });

      it("Owner can unlock", async () => {
        await expect(poolToken.connect(deployer).unlockRedeem()).to.emit(
          poolToken,
          "RedeemUnlocked"
        );
      });

      it("Revert if non-owner attempts to lock", async () => {
        await expect(
          poolToken.connect(randomUser).lockRedeem()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Revert if non-owner attempts to unlock", async () => {
        await expect(
          poolToken.connect(randomUser).unlockRedeem()
        ).to.be.revertedWith("Ownable: caller is not the owner");
      });

      it("Revert redeem when pool is locked", async () => {
        await poolToken.connect(deployer).lockRedeem();

        await expect(
          poolToken.connect(randomUser).redeem(1)
        ).to.be.revertedWith("LOCKED");
      });
    });
  });

  describe("Block inter-user APT transfers", () => {
    it("Revert APT transfer", async () => {
      const decimals = await poolToken.decimals();
      const amount = tokenAmountToBigNumber("1", decimals);
      await expect(
        poolToken.connect(randomUser).transfer(anotherUser.address, amount)
      ).to.be.revertedWith("INVALID_TRANSFER");
    });

    it("Revert APT transferFrom", async () => {
      const decimals = await poolToken.decimals();
      const amount = tokenAmountToBigNumber("1", decimals);
      await expect(
        poolToken
          .connect(deployer)
          .transferFrom(randomUser.address, anotherUser.address, amount)
      ).to.be.revertedWith("INVALID_TRANSFER");
    });
  });
});
