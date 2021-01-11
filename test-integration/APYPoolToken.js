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

/* ************************ */
/* set DEBUG log level here */
/* ************************ */
console.debugging = false;
/* ************************ */

describe("Contract: APYPoolToken", () => {
  let owner;
  let admin;
  let randomUser;

  let ProxyAdmin;
  let APYPoolTokenProxy;
  let APYPoolToken;

  before(async () => {
    [owner, admin, randomUser] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    APYPoolTokenProxy = await ethers.getContractFactory("APYPoolTokenProxy");
    APYPoolToken = await ethers.getContractFactory("APYPoolToken");
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

    describe(`\n    **** ${symbol} as underlyer ****\n`, async () => {
      let agg;
      let underlyer;

      let proxyAdmin;
      let logic;
      let proxy;
      let poolToken;

      let expectedAptMinted;
      let aptMinted;
      let underlyerBalanceBefore;

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

        const ownerAddress = await owner.getAddress();
        await acquireToken(
          STABLECOIN_POOLS[symbol],
          ownerAddress,
          underlyer,
          "1000000",
          ownerAddress
        );

        //handle allownaces
        await underlyer.approve(poolToken.address, MAX_UINT256);

        console.debug(`Proxy Admin: ${proxyAdmin.address}`);
        console.debug(`Logic: ${logic.address}`);
        console.debug(`Proxy: ${proxy.address}`);
      });

      describe("Test Defaults", async () => {
        it("Test Owner", async () => {
          assert.equal(await poolToken.owner.call(), owner.address);
        });

        it("Test DEFAULT_APT_TO_UNDERLYER_FACTOR", async () => {
          assert.equal(
            await poolToken.DEFAULT_APT_TO_UNDERLYER_FACTOR.call(),
            1000
          );
        });

        it("Test Pool Token Name", async () => {
          assert.equal(await poolToken.name.call(), "APY Pool Token");
        });

        it("Test Pool Symbol", async () => {
          assert.equal(await poolToken.symbol.call(), "APT");
        });

        it("Test Pool Decimals", async () => {
          assert.equal(await poolToken.decimals.call(), 18);
        });

        it("Test sending Ether", async () => {
          const signer = (await ethers.getSigners())[0];
          await expect(
            signer.sendTransaction({ to: poolToken.address, value: "10" })
          ).to.be.revertedWith("DONT_SEND_ETHER");
        });
      });

      describe("Test setAdminAdddress", async () => {
        it("Test setAdminAddress pass", async () => {
          await poolToken.connect(owner).setAdminAddress(admin.address);
          assert.equal(await poolToken.proxyAdmin.call(), admin.address);
        });
      });

      describe("Test calculateMintAmount", async () => {
        it("Test calculateMintAmount returns expeted amount when total supply > 0", async () => {
          expectedAptMinted = await poolToken.calculateMintAmount(1000000000, {
            from: randomUser,
          });
          console.log(`\tExpected APT Minted: ${expectedAptMinted.toString()}`);
          assert(expectedAptMinted.gt(0));
        });
      });

      describe("Test addLiquidity", async () => {
        it("Test locking/unlocking addLiquidity by owner", async () => {
          await expect(poolToken.connect(owner).lockAddLiquidity()).to.emit(
            poolToken,
            "AddLiquidityLocked"
          );

          await expect(poolToken.connect(owner).unlockAddLiquidity()).to.emit(
            poolToken,
            "AddLiquidityUnlocked"
          );
        });

        it("Test addLiquidity pass", async () => {
          underlyerBalanceBefore = await underlyer.balanceOf(owner.address);
          console.log(
            `\tUSDC Balance Before Mint: ${underlyerBalanceBefore.toString()}`
          );

          const amount = tokenAmountToBigNumber(
            1000,
            await underlyer.decimals()
          );
          const trx = await poolToken.connect(owner).addLiquidity(amount);

          let bal = await underlyer.balanceOf(owner.address);
          console.log(`\tUSDC Balance After Mint: ${bal.toString()}`);

          // assert balances
          assert(await underlyer.balanceOf(poolToken.address), amount);
          assert(
            await underlyer.balanceOf(owner.address),
            underlyerBalanceBefore - amount
          );

          // comupting the exact amount is unreliable due to variance in USDC/ETH
          aptMinted = await poolToken.balanceOf(owner.address);
          console.log(`\tAPT Balance: ${aptMinted.toString()}`);
          assert(aptMinted.toString(), expectedAptMinted.toString());

          const tokenEthVal = await poolToken.getEthValueFromTokenAmount(
            amount
          );

          // this is the token transfer
          await expectEvent.inTransaction(trx.tx, underlyer, "Transfer", {
            from: owner,
            to: poolToken.address,
            value: amount,
          });
          // this is the mint transfer
          await expectEvent(trx, "Transfer", {
            from: ZERO_ADDRESS,
            to: owner,
            value: aptMinted,
          });
          await expectEvent(trx, "DepositedAPT", {
            sender: owner,
            tokenAmount: amount,
            aptMintAmount: aptMinted,
            tokenEthValue: tokenEthVal,
            totalEthValueLocked: tokenEthVal,
          });
        });
      });

      describe("Test getPoolTotalEthValue", async () => {
        it("Test getPoolTotalEthValue returns value", async () => {
          const val = await poolToken.getPoolTotalEthValue.call();
          console.log(`\tPool Total Eth Value ${val.toString()}`);
          assert(val.toString(), aptMinted.div("1000").toString());
        });
      });

      describe("Test getAPTEthValue", async () => {
        it("Test getAPTEthValue returns value", async () => {
          const val = await poolToken.getAPTEthValue(aptMinted);
          console.log(`\tAPT Eth Value: ${val.toString()}`);
          assert(val.toString(), aptMinted.div("1000").toString());
        });
      });

      describe("Test getTokenAmountFromEthValue", async () => {
        it("Test getTokenAmountFromEthValue returns expected amount", async () => {
          const tokenAmount = await poolToken.getTokenAmountFromEthValue.call(
            "500"
          );
          console.log(
            `\tToken Amount from Eth Value: ${tokenAmount.toString()}`
          );
          assert(tokenAmount.gt(0));
        });
      });

      describe("Test getEthValueFromTokenAmount", async () => {
        it("Test getEthValueFromTokenAmount returns value", async () => {
          const val = await poolToken.getEthValueFromTokenAmount("5000");
          console.log(`\tEth Value from Token Amount ${val.toString()}`);
          assert(val.gt(0));
        });
      });

      describe("Test getTokenEthPrice", async () => {
        it("Test getTokenEthPrice returns value", async () => {
          const price = await poolToken.getTokenEthPrice.call();
          console.log(`\tToken Eth Price: ${price.toString()}`);
          assert(price.gt(0));
        });
      });

      describe("Test getUnderlyerAmount", async () => {
        it("Test getUnderlyerAmount returns value", async () => {
          const underlyerAmount = await poolToken.getUnderlyerAmount(
            "2605000000000000000000"
          );
          console.log(`\tUnderlyer Amount: ${underlyerAmount.toString()}`);
          assert(underlyerAmount.gt(0));
        });
      });

      describe("Test redeem", async () => {
        it("Test locking/unlocking redeem by owner", async () => {
          await expect(poolToken.connect(owner).lockRedeem()).to.emit(
            poolToken,
            "RedeemLocked"
          );

          await expect(
            poolToken.connect(randomUser).redeem(50)
          ).to.be.revertedWith("LOCKED");

          await expect(poolToken.connect(owner).unlockRedeem()).to.emit(
            poolToken,
            "RedeemUnlocked"
          );
        });

        it("Test locking/unlocking contract by not owner", async () => {
          await expect(poolToken.connect(owner).lock()).to.emit(
            poolToken,
            "Paused"
          );

          await expect(
            poolToken.connect(randomUser).redeem(50)
          ).to.be.revertedWith("Pausable: paused");

          await expect(poolToken.connect(owner).unlock()).to.emit(
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
          let usdcBal = await underlyer.balanceOf(owner);
          console.log(`\tUSDC Balance Before Redeem: ${usdcBal.toString()}`);

          const trx = await poolToken.redeem(aptMinted, {
            from: owner,
          });

          let usdcBalAfter = await underlyer.balanceOf(owner);
          console.log(
            `\tUSDC Balance After Redeem: ${usdcBalAfter.toString()}`
          );

          // assert balances
          assert.equal(
            usdcBalAfter.toString(),
            underlyerBalanceBefore.toString()
          );
          assert.equal(await underlyer.balanceOf(poolToken.address), 0);

          const bal = await poolToken.balanceOf(owner);
          console.log(`\tAPT Balance: ${bal.toString()}`);
          assert.equal(bal.toString(), "0");

          const tokenEthVal = await poolToken.getEthValueFromTokenAmount(
            usdcBalAfter.sub(usdcBal)
          );

          await expectEvent.inTransaction(trx.tx, underlyer, "Transfer", {
            from: poolToken.address,
            to: owner,
            value: usdcBalAfter.sub(usdcBal),
          });
          await expectEvent(trx, "Transfer", {
            from: owner,
            to: ZERO_ADDRESS,
            value: aptMinted,
          });
          await expectEvent(trx, "RedeemedAPT", {
            sender: owner,
            token: underlyer.address,
            redeemedTokenAmount: usdcBalAfter.sub(usdcBal),
            tokenEthValue: tokenEthVal,
            totalEthValueLocked: "0",
          });
        });
      });
    });
  });
});
