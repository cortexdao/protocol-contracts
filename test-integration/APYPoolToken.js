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
const { BigNumber } = require("ethers");

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

  before(async () => {
    [deployer, admin, randomUser] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    APYPoolTokenProxy = await ethers.getContractFactory("APYPoolTokenProxy");
    APYPoolToken = await ethers.getContractFactory("TestAPYPoolToken");
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

      let proxyAdmin;
      let logic;
      let proxy;
      let poolToken;

      before("Setup", async () => {
        underlyer = await ethers.getContractAt("IDetailedERC20", tokenAddress);
        agg = await ethers.getContractAt("AggregatorV3Interface", aggAddress);

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

        await acquireToken(
          STABLECOIN_POOLS[symbol],
          deployer.address,
          underlyer,
          "1000000",
          deployer.address
        );

        //handle allownaces
        await underlyer.approve(poolToken.address, MAX_UINT256);

        console.debug(`Proxy Admin: ${proxyAdmin.address}`);
        console.debug(`Logic: ${logic.address}`);
        console.debug(`Proxy: ${proxy.address}`);
      });

      describe("Test Defaults", () => {
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
          assert.equal(await poolToken.symbol.call(), "APT");
        });

        it("Decimals has correct value", async () => {
          assert.equal(await poolToken.decimals.call(), 18);
        });

        it("Blocks ether transfer", async () => {
          const signer = (await ethers.getSigners())[0];
          await expect(
            signer.sendTransaction({ to: poolToken.address, value: "10" })
          ).to.be.revertedWith("DONT_SEND_ETHER");
        });
      });

      describe("Test setAdminAdddress", () => {
        it("Owner can set admin address", async () => {
          await poolToken.connect(deployer).setAdminAddress(admin.address);
          assert.equal(await poolToken.proxyAdmin(), admin.address);
        });
      });

      describe("Test calculateMintAmount", () => {
        it("calculateMintAmount returns value", async () => {
          const expectedAptMinted = await poolToken.calculateMintAmount(
            1000000000
          );
          console.debug(
            `\tExpected APT Minted: ${expectedAptMinted.toString()}`
          );
          assert(expectedAptMinted.gt(0));
        });
      });
      describe("Test getPoolTotalEthValue", () => {
        it("getPoolTotalEthValue returns value", async () => {
          const val = await poolToken.getPoolTotalEthValue.call();
          console.debug(`\tPool Total Eth Value ${val.toString()}`);
          assert(val.gt(0));
        });
      });

      describe("Test getAPTEthValue", () => {
        it("getAPTEthValue returns value", async () => {
          const val = await poolToken.getAPTEthValue(100);
          console.debug(`\tAPT Eth Value: ${val.toString()}`);
          assert(val.gt(0));
        });
      });

      describe("Test getTokenAmountFromEthValue", () => {
        it("getTokenAmountFromEthValue returns value", async () => {
          const tokenAmount = await poolToken.getTokenAmountFromEthValue.call(
            "500"
          );
          console.debug(
            `\tToken Amount from Eth Value: ${tokenAmount.toString()}`
          );
          assert(tokenAmount.gt(0));
        });
      });

      describe("Test getEthValueFromTokenAmount", () => {
        it("getEthValueFromTokenAmount returns value", async () => {
          const val = await poolToken.getEthValueFromTokenAmount("5000");
          console.debug(`\tEth Value from Token Amount ${val.toString()}`);
          assert(val.gt(0));
        });
      });

      describe("Test getTokenEthPrice", () => {
        it("getTokenEthPrice returns value", async () => {
          const price = await poolToken.getTokenEthPrice.call();
          console.debug(`\tToken Eth Price: ${price.toString()}`);
          assert(price.gt(0));
        });
      });

      describe("Test getUnderlyerAmount", () => {
        it("getUnderlyerAmount returns value", async () => {
          const underlyerAmount = await poolToken.getUnderlyerAmount(
            "2605000000000000000000"
          );
          console.log(`\tUnderlyer Amount: ${underlyerAmount.toString()}`);
          assert(underlyerAmount.gt(0));
        });
      });

      describe("Test addLiquidity", () => {
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
            deployer.address
          );
          console.debug(
            `\tUSDC Balance Before Mint: ${underlyerBalanceBefore.toString()}`
          );

          const amount = tokenAmountToBigNumber(
            1000,
            await underlyer.decimals()
          );
          const addLiquidityPromise = poolToken
            .connect(deployer)
            .addLiquidity(amount);
          const trx = await addLiquidityPromise;
          await trx.wait();

          let bal = await underlyer.balanceOf(deployer.address);
          console.debug(`\tUSDC Balance After Mint: ${bal.toString()}`);

          expect(await underlyer.balanceOf(poolToken.address)).to.equal(amount);
          expect(await underlyer.balanceOf(deployer.address)).to.equal(
            underlyerBalanceBefore.sub(amount)
          );

          const aptMinted = await poolToken.balanceOf(deployer.address);
          console.debug(`\tAPT Balance: ${aptMinted.toString()}`);

          const tokenEthVal = await poolToken.getEthValueFromTokenAmount(
            amount
          );

          // this is the token transfer
          await expectEventInTransaction(trx.hash, underlyer, "Transfer", {
            from: deployer.address,
            to: poolToken.address,
            value: amount,
          });
          // this is the mint transfer
          await expect(addLiquidityPromise)
            .to.emit(poolToken, "Transfer")
            .withArgs(ZERO_ADDRESS, deployer.address, aptMinted);
          await expect(addLiquidityPromise)
            .to.emit(poolToken, "DepositedAPT")
            .withArgs(
              deployer.address,
              underlyer.address,
              amount,
              aptMinted,
              tokenEthVal,
              tokenEthVal
            );
        });
      });

      describe("Test redeem", () => {
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
          const aptMinted = BigNumber.from("100");
          await (await poolToken.mint(deployer.address, aptMinted)).wait();

          let usdcBal = await underlyer.balanceOf(deployer.address);
          console.debug(`\tUSDC Balance Before Redeem: ${usdcBal.toString()}`);

          const redeemPromise = poolToken.connect(deployer).redeem(aptMinted);
          const trx = await redeemPromise;
          await trx.wait();

          let usdcBalAfter = await underlyer.balanceOf(deployer.address);
          console.debug(
            `\tUSDC Balance After Redeem: ${usdcBalAfter.toString()}`
          );

          assert.equal(await underlyer.balanceOf(poolToken.address), 0);

          const bal = await poolToken.balanceOf(deployer.address);
          console.debug(`\tAPT Balance: ${bal.toString()}`);
          assert.equal(bal.toString(), "0");

          const tokenEthVal = await poolToken.getEthValueFromTokenAmount(
            usdcBalAfter.sub(usdcBal)
          );

          await expectEventInTransaction(trx.hash, underlyer, "Transfer", {
            from: poolToken.address,
            to: deployer.address,
            value: usdcBalAfter.sub(usdcBal),
          });
          await expect(redeemPromise)
            .to.emit(poolToken, "Transfer")
            .withArgs(deployer.address, ZERO_ADDRESS, aptMinted);
          await expect(redeemPromise)
            .to.emit(poolToken, "RedeemedAPT")
            .withArgs(
              deployer.address,
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
