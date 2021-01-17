const { assert, expect } = require("chai");
const { ethers } = require("hardhat");
const { AddressZero: ZERO_ADDRESS, MaxUint256: MAX_UINT256 } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const { STABLECOIN_POOLS } = require("../utils/constants");
const {
  acquireToken,
  console,
  tokenAmountToBigNumber,
} = require("../utils/helpers");
const expectEvent = require("@openzeppelin/test-helpers/src/expectEvent");

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

async function expectEventInTransaction(
  txHash,
  emitter,
  eventName,
  eventArgs = {}
) {
  /*
  Ethers-wrapper for OpenZeppelin's test helper.

  Their test helper still works as long as BigNumber is passed-in as strings and
  the emitter has a Truffle-like interface, i.e. has properties `abi` and `address`.
  */
  const abi = JSON.parse(emitter.interface.format("json"));
  const address = emitter.address;
  const _emitter = { abi, address };
  const _eventArgs = Object.fromEntries(
    Object.entries(eventArgs).map(([k, v]) => [k, v.toString()])
  );
  await expectEvent.inTransaction(txHash, _emitter, eventName, _eventArgs);
}

describe("Contract: APYPoolToken", () => {
  let deployer;
  let admin;
  let randomUser;

  let ProxyAdmin;
  let APYPoolTokenProxy;
  let APYPoolToken;

  let APYMetaPoolToken;

  before(async () => {
    [deployer, admin, randomUser] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    APYPoolTokenProxy = await ethers.getContractFactory("APYPoolTokenProxy");
    APYPoolToken = await ethers.getContractFactory("TestAPYPoolToken");

    APYMetaPoolToken = await ethers.getContractFactory("APYMetaPoolToken");
  });

  const tokenParams = [
    {
      symbol: "USDC",
      tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      aggAddress: "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
    },
    {
      symbol: "DAI",
      tokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      aggAddress: "0x773616E4d11A78F511299002da57A0a94577F1f4",
    },
    {
      symbol: "USDT",
      tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      aggAddress: "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46",
    },
  ];

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  tokenParams.forEach(function (params) {
    const { symbol, tokenAddress, aggAddress } = params;

    describe(`\n    **** ${symbol} as underlyer ****\n`, () => {
      let agg;
      let underlyer;
      let mApt;

      let proxyAdmin;
      let logic;
      let proxy;
      let poolToken;

      before("Setup", async () => {
        agg = await ethers.getContractAt("AggregatorV3Interface", aggAddress);
        underlyer = await ethers.getContractAt("IDetailedERC20", tokenAddress);
        mApt = await APYMetaPoolToken.deploy();
        await mApt.deployed();

        proxyAdmin = await ProxyAdmin.deploy();
        await proxyAdmin.deployed();
        logic = await APYPoolToken.deploy();
        await logic.deployed();
        proxy = await APYPoolTokenProxy.deploy(
          logic.address,
          proxyAdmin.address,
          underlyer.address,
          agg.address
        );
        await proxy.deployed();
        poolToken = await APYPoolToken.attach(proxy.address);

        await poolToken.setMetaPoolToken(mApt.address);

        await acquireToken(
          STABLECOIN_POOLS[symbol],
          randomUser.address,
          underlyer,
          "1000000",
          randomUser.address
        );

        //handle allownaces
        await underlyer
          .connect(randomUser)
          .approve(poolToken.address, MAX_UINT256);

        console.debug(`Proxy Admin: ${proxyAdmin.address}`);
        console.debug(`Logic: ${logic.address}`);
        console.debug(`Proxy: ${proxy.address}`);
      });

      describe("Defaults", () => {
        it("Owner is set to deployer", async () => {
          assert.equal(await poolToken.owner(), deployer.address);
        });

        it("DEFAULT_APT_TO_UNDERLYER_FACTOR has correct value", async () => {
          assert.equal(await poolToken.DEFAULT_APT_TO_UNDERLYER_FACTOR(), 1000);
        });

        it("Name has correct value", async () => {
          assert.equal(await poolToken.name(), "APY Pool Token");
        });

        it("Symbol has correct value", async () => {
          assert.equal(await poolToken.symbol(), "APT");
        });

        it("Decimals has correct value", async () => {
          assert.equal(await poolToken.decimals(), 18);
        });

        it("Blocks ether transfer", async () => {
          const signer = (await ethers.getSigners())[0];
          await expect(
            signer.sendTransaction({ to: poolToken.address, value: "10" })
          ).to.be.revertedWith("DONT_SEND_ETHER");
        });
      });

      it("Owner can set admin address", async () => {
        await poolToken.connect(deployer).setAdminAddress(admin.address);
        assert.equal(await poolToken.proxyAdmin(), admin.address);
      });

      describe("Underlyer integration with calculations", () => {
        beforeEach(async () => {
          /* these get rollbacked after each test due to snapshotting */
          const aptAmount = tokenAmountToBigNumber("1000000000", "18");
          await poolToken.mint(deployer.address, aptAmount);
          const symbol = await underlyer.symbol();
          await acquireToken(
            STABLECOIN_POOLS[symbol],
            poolToken.address,
            underlyer,
            "10000",
            deployer.address
          );
        });

        it("calculateMintAmount returns value", async () => {
          const expectedAptMinted = await poolToken.calculateMintAmount(
            1000000000
          );
          console.debug(
            `\tExpected APT Minted: ${expectedAptMinted.toString()}`
          );
          assert(expectedAptMinted.gt(0));
        });

        it("getPoolTotalEthValue returns value", async () => {
          const val = await poolToken.getPoolTotalEthValue();
          console.debug(`\tPool Total Eth Value ${val.toString()}`);
          assert(val.gt(0));
        });

        it("getAPTEthValue returns value", async () => {
          const aptAmount = tokenAmountToBigNumber("100", "18");
          const val = await poolToken.getAPTEthValue(aptAmount);
          console.debug(`\tAPT Eth Value: ${val.toString()}`);
          assert(val.gt(0));
        });

        it("getTokenAmountFromEthValue returns value", async () => {
          const ethAmount = tokenAmountToBigNumber("500", "18");
          const tokenAmount = await poolToken.getTokenAmountFromEthValue(
            ethAmount
          );
          console.debug(
            `\tToken Amount from Eth Value: ${tokenAmount.toString()}`
          );
          assert(tokenAmount.gt(0));
        });

        it("getEthValueFromTokenAmount returns value", async () => {
          const val = await poolToken.getEthValueFromTokenAmount("5000");
          console.debug(`\tEth Value from Token Amount ${val.toString()}`);
          assert(val.gt(0));
        });

        it("getTokenEthPrice returns value", async () => {
          const price = await poolToken.getTokenEthPrice();
          console.debug(`\tToken Eth Price: ${price.toString()}`);
          assert(price.gt(0));
        });

        it("getUnderlyerAmount returns value", async () => {
          const aptAmount = tokenAmountToBigNumber("100", "18");
          const underlyerAmount = await poolToken.getUnderlyerAmount(aptAmount);
          console.debug(`\tUnderlyer Amount: ${underlyerAmount.toString()}`);
          assert(underlyerAmount.gt(0));
        });
      });

      describe("Add liquidity", () => {
        it("Test locking/unlocking addLiquidity by owner", async () => {
          await expect(poolToken.connect(deployer).lockAddLiquidity()).to.emit(
            poolToken,
            "AddLiquidityLocked"
          );

          await expect(
            poolToken.connect(deployer).unlockAddLiquidity()
          ).to.emit(poolToken, "AddLiquidityUnlocked");
        });

        it("Test addLiquidity pass", async () => {
          const underlyerBalanceBefore = await underlyer.balanceOf(
            randomUser.address
          );
          console.debug(
            `\tUSDC Balance Before Mint: ${underlyerBalanceBefore.toString()}`
          );

          const amount = tokenAmountToBigNumber(
            1000,
            await underlyer.decimals()
          );
          const addLiquidityPromise = poolToken
            .connect(randomUser)
            .addLiquidity(amount);
          const trx = await addLiquidityPromise;
          await trx.wait();

          let bal = await underlyer.balanceOf(randomUser.address);
          console.debug(`\tUSDC Balance After Mint: ${bal.toString()}`);

          expect(await underlyer.balanceOf(poolToken.address)).to.equal(amount);
          expect(await underlyer.balanceOf(randomUser.address)).to.equal(
            underlyerBalanceBefore.sub(amount)
          );

          const aptMinted = await poolToken.balanceOf(randomUser.address);
          console.debug(`\tAPT Balance: ${aptMinted.toString()}`);

          const tokenEthVal = await poolToken.getEthValueFromTokenAmount(
            amount
          );

          // this is the token transfer
          await expectEventInTransaction(trx.hash, underlyer, "Transfer", {
            from: randomUser.address,
            to: poolToken.address,
            value: amount,
          });
          // this is the mint transfer
          await expect(addLiquidityPromise)
            .to.emit(poolToken, "Transfer")
            .withArgs(ZERO_ADDRESS, randomUser.address, aptMinted);
          await expect(addLiquidityPromise)
            .to.emit(poolToken, "DepositedAPT")
            .withArgs(
              randomUser.address,
              underlyer.address,
              amount,
              aptMinted,
              tokenEthVal,
              tokenEthVal
            );
        });
      });

      describe("Redeem", () => {
        it("Test locking/unlocking redeem by owner", async () => {
          await expect(poolToken.connect(deployer).lockRedeem()).to.emit(
            poolToken,
            "RedeemLocked"
          );

          await expect(
            poolToken.connect(randomUser).redeem(50)
          ).to.be.revertedWith("LOCKED");

          await expect(poolToken.connect(deployer).unlockRedeem()).to.emit(
            poolToken,
            "RedeemUnlocked"
          );
        });

        it("Test locking/unlocking contract by not owner", async () => {
          await expect(poolToken.connect(deployer).lock()).to.emit(
            poolToken,
            "Paused"
          );

          await expect(
            poolToken.connect(randomUser).redeem(50)
          ).to.be.revertedWith("Pausable: paused");

          await expect(poolToken.connect(deployer).unlock()).to.emit(
            poolToken,
            "Unpaused"
          );
        });

        it("Test redeem insufficient balance", async () => {
          await expect(
            poolToken.connect(randomUser).redeem(2)
          ).to.be.revertedWith("BALANCE_INSUFFICIENT");
        });

        it("Test redeem pass", async () => {
          const aptMinted = tokenAmountToBigNumber("100", "18");
          await (await poolToken.mint(randomUser.address, aptMinted)).wait();

          let usdcBal = await underlyer.balanceOf(randomUser.address);
          console.debug(`\tUSDC Balance Before Redeem: ${usdcBal.toString()}`);

          const redeemPromise = poolToken.connect(randomUser).redeem(aptMinted);
          const trx = await redeemPromise;
          await trx.wait();

          let usdcBalAfter = await underlyer.balanceOf(randomUser.address);
          console.debug(
            `\tUSDC Balance After Redeem: ${usdcBalAfter.toString()}`
          );

          assert.equal(await underlyer.balanceOf(poolToken.address), 0);

          const bal = await poolToken.balanceOf(randomUser.address);
          console.debug(`\tAPT Balance: ${bal.toString()}`);
          assert.equal(bal.toString(), "0");

          const tokenEthVal = await poolToken.getEthValueFromTokenAmount(
            usdcBalAfter.sub(usdcBal)
          );

          await expectEventInTransaction(trx.hash, underlyer, "Transfer", {
            from: poolToken.address,
            to: randomUser.address,
            value: usdcBalAfter.sub(usdcBal),
          });
          await expect(redeemPromise)
            .to.emit(poolToken, "Transfer")
            .withArgs(randomUser.address, ZERO_ADDRESS, aptMinted);
          await expect(redeemPromise)
            .to.emit(poolToken, "RedeemedAPT")
            .withArgs(
              randomUser.address,
              underlyer.address,
              usdcBalAfter.sub(usdcBal),
              aptMinted,
              tokenEthVal,
              tokenEthVal
            );
        });
      });
    });
  });
});
