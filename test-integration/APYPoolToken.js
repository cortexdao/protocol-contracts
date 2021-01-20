const { assert, expect } = require("chai");
const { ethers } = require("hardhat");
const { AddressZero: ZERO_ADDRESS, MaxUint256: MAX_UINT256 } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const { STABLECOIN_POOLS } = require("../utils/constants");
const {
  acquireToken,
  console,
  tokenAmountToBigNumber,
  FAKE_ADDRESS,
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
  let anotherUser;

  let ProxyAdmin;
  let APYPoolTokenProxy;
  let APYPoolToken;

  let APYMetaPoolToken;

  before(async () => {
    [deployer, admin, randomUser, anotherUser] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    APYPoolTokenProxy = await ethers.getContractFactory("APYPoolTokenProxy");
    APYPoolToken = await ethers.getContractFactory("TestAPYPoolToken");

    APYMetaPoolToken = await ethers.getContractFactory("TestAPYMetaPoolToken");
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
        await underlyer
          .connect(anotherUser)
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

      describe("Set admin address", async () => {
        it("Owner can set admin", async () => {
          await poolToken.connect(deployer).setAdminAddress(admin.address);
          assert.equal(await poolToken.proxyAdmin(), admin.address);
        });

        it("Revert on setting to zero address", async () => {
          await expect(
            poolToken.connect(deployer).setAdminAddress(ZERO_ADDRESS)
          ).to.be.reverted;
        });

        it("Revert when non-owner attempts to set address", async () => {
          await expect(
            poolToken.connect(randomUser).setAdminAddress(admin.address)
          ).to.be.reverted;
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
          const trx = await setPromise;
          await trx.wait();

          const priceAgg = await poolToken.priceAgg();

          assert.equal(priceAgg, FAKE_ADDRESS);

          await expect(setPromise)
            .to.emit(poolToken, "PriceAggregatorChanged")
            .withArgs(FAKE_ADDRESS);
        });
      });

      describe("Set mAPT address", async () => {
        it("Owner can set mAPT address", async () => {
          const newMApt = await APYMetaPoolToken.deploy();
          await newMApt.deployed();
          await poolToken.connect(deployer).setMetaPoolToken(newMApt.address);
          assert.equal(await poolToken.mApt(), newMApt.address);
        });

        it("Revert on setting to non-contract address", async () => {
          await expect(
            poolToken.connect(deployer).setMetaPoolToken(FAKE_ADDRESS)
          ).to.be.reverted;
        });

        it("Revert when non-owner attempts to set address", async () => {
          await expect(
            poolToken.connect(randomUser).setMetaPoolToken(admin.address)
          ).to.be.reverted;
        });
      });

      describe("Approvals", () => {
        it("Owner can call infiniteApprove", async () => {
          await expect(
            poolToken.connect(deployer).infiniteApprove(FAKE_ADDRESS)
          ).to.not.be.reverted;
        });

        it("Revert when non-owner calls infiniteApprove", async () => {
          await expect(
            poolToken.connect(randomUser).infiniteApprove(FAKE_ADDRESS)
          ).to.be.reverted;
        });

        it("Owner can call revokeApprove", async () => {
          await expect(poolToken.connect(deployer).revokeApprove(FAKE_ADDRESS))
            .to.not.be.reverted;
        });

        it("Revert when non-owner calls revokeApprove", async () => {
          await expect(
            poolToken.connect(randomUser).revokeApprove(FAKE_ADDRESS)
          ).to.be.reverted;
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
          await expect(
            poolToken.connect(randomUser).unlock()
          ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("Revert when calling addLiquidity/redeem on locked pool", async () => {
          await poolToken.connect(deployer).lock();

          await expect(
            poolToken.connect(randomUser).addLiquidity(50)
          ).to.revertedWith("Pausable: paused");

          await expect(
            poolToken.connect(randomUser).redeem(50)
          ).to.revertedWith("Pausable: paused");
        });

        it("Revert when calling infiniteApprove on locked pool", async () => {
          await poolToken.connect(deployer).lock();

          await expect(
            poolToken.connect(deployer).infiniteApprove(FAKE_ADDRESS)
          ).to.revertedWith("Pausable: paused");
        });

        it("Allow calling revokeApprove on locked pool", async () => {
          await poolToken.connect(deployer).lock();

          await expect(poolToken.connect(deployer).revokeApprove(FAKE_ADDRESS))
            .to.not.be.reverted;
        });
      });

      describe("Lock addLiquidity", () => {
        it("Owner can lock", async () => {
          await expect(poolToken.connect(deployer).lockAddLiquidity()).to.emit(
            poolToken,
            "AddLiquidityLocked"
          );
        });

        it("Owner can unlock", async () => {
          await expect(
            poolToken.connect(deployer).unlockAddLiquidity()
          ).to.emit(poolToken, "AddLiquidityUnlocked");
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

        it("Deposit should work after unlock", async () => {
          await poolToken.connect(deployer).lockAddLiquidity();
          await poolToken.connect(deployer).unlockAddLiquidity();

          await expect(poolToken.connect(randomUser).addLiquidity(1)).to.not.be
            .reverted;
        });
      });

      describe("Lock redeem", () => {
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

        it("Redeem should work after unlock", async () => {
          await poolToken.connect(deployer).lockRedeem();
          await poolToken.connect(deployer).unlockRedeem();

          await poolToken.mint(randomUser.address, 1);
          await expect(poolToken.connect(randomUser).redeem(1)).to.not.be
            .reverted;
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

      const deployedValues = [
        tokenAmountToBigNumber(0),
        tokenAmountToBigNumber(83729),
        tokenAmountToBigNumber(32283729),
      ];
      deployedValues.forEach(function (deployedValue) {
        describe(`deployed value: ${deployedValue}`, () => {
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
              const underlyerAmount = await poolToken.getUnderlyerAmount(
                aptAmount
              );
              console.debug(
                `\tUnderlyer Amount: ${underlyerAmount.toString()}`
              );
              assert(underlyerAmount.gt(0));
            });
          });

          describe("addLiquidity", () => {
            it("Revert if deposit is zero", async () => {
              await expect(poolToken.addLiquidity(0)).to.be.revertedWith(
                "AMOUNT_INSUFFICIENT"
              );
            });

            it("Revert if allowance is less than deposit", async () => {
              await expect(poolToken.addLiquidity(1)).to.be.revertedWith(
                "ALLOWANCE_INSUFFICIENT"
              );
            });

            it("Test addLiquidity pass", async () => {
              const underlyerBalanceBefore = await underlyer.balanceOf(
                randomUser.address
              );
              console.debug(
                `\tUnderlyer Balance Before Mint: ${underlyerBalanceBefore.toString()}`
              );

              const depositAmount = tokenAmountToBigNumber(
                1000,
                await underlyer.decimals()
              );
              const mintAmount = await poolToken.calculateMintAmount(
                depositAmount
              );

              const addLiquidityPromise = poolToken
                .connect(randomUser)
                .addLiquidity(depositAmount);
              const trx = await addLiquidityPromise;
              await trx.wait();

              let underlyerBalanceAfter = await underlyer.balanceOf(
                randomUser.address
              );
              console.debug(
                `\tUnderlyer Balance After Mint: ${underlyerBalanceAfter.toString()}`
              );

              expect(await underlyer.balanceOf(poolToken.address)).to.equal(
                depositAmount
              );
              expect(await underlyer.balanceOf(randomUser.address)).to.equal(
                underlyerBalanceBefore.sub(depositAmount)
              );
              expect(await poolToken.balanceOf(randomUser.address)).to.equal(
                mintAmount
              );

              // APT transfer event
              await expectEventInTransaction(trx.hash, underlyer, "Transfer", {
                from: randomUser.address,
                to: poolToken.address,
                value: depositAmount,
              });

              // APT transfer event
              await expect(addLiquidityPromise)
                .to.emit(poolToken, "Transfer")
                .withArgs(ZERO_ADDRESS, randomUser.address, mintAmount);

              // DepositedAPT event:
              // check the values reflect post-interaction state
              const tokenEthVal = await poolToken.getEthValueFromTokenAmount(
                depositAmount
              );
              await expect(addLiquidityPromise)
                .to.emit(poolToken, "DepositedAPT")
                .withArgs(
                  randomUser.address,
                  underlyer.address,
                  depositAmount,
                  mintAmount,
                  tokenEthVal,
                  tokenEthVal
                );
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
              await expect(
                poolToken.connect(randomUser).redeem(2)
              ).to.be.revertedWith("BALANCE_INSUFFICIENT");
            });

            it("Test redeem pass", async () => {
              // setup APT redeem amount and corresponding underlyer amount
              const aptAmount = tokenAmountToBigNumber("100", "18");
              await (
                await poolToken.mint(randomUser.address, aptAmount)
              ).wait();
              const underlyerAmount = await poolToken.getUnderlyerAmount(
                aptAmount
              );

              let underlyerBalanceBefore = await underlyer.balanceOf(
                randomUser.address
              );
              console.debug(
                `\tUnderlyer Balance Before Redeem: ${underlyerBalanceBefore.toString()}`
              );

              // execute the redeem
              const redeemPromise = poolToken
                .connect(randomUser)
                .redeem(aptAmount);
              const trx = await redeemPromise;
              await trx.wait();

              // start the asserts
              let underlyerBalanceAfter = await underlyer.balanceOf(
                randomUser.address
              );
              console.debug(
                `\tUnderlyer Balance After Redeem: ${underlyerBalanceAfter.toString()}`
              );
              const underlyerTransferAmount = underlyerBalanceAfter.sub(
                underlyerBalanceBefore
              );
              expect(underlyerTransferAmount).to.equal(underlyerAmount);

              const aptBalance = await poolToken.balanceOf(randomUser.address);
              console.debug(`\tAPT Balance: ${aptBalance.toString()}`);
              expect(aptBalance).to.equal(0);

              // underlyer transfer event
              await expectEventInTransaction(trx.hash, underlyer, "Transfer", {
                from: poolToken.address,
                to: randomUser.address,
                value: underlyerTransferAmount,
              });

              // APT transfer event
              await expect(redeemPromise)
                .to.emit(poolToken, "Transfer")
                .withArgs(randomUser.address, ZERO_ADDRESS, aptAmount);

              // RedeemedAPT event:
              // check the values reflect post-interaction state
              const tokenEthValue = await poolToken.getEthValueFromTokenAmount(
                underlyerTransferAmount
              );
              const poolEthValue = await poolToken.getPoolTotalEthValue();
              await expect(redeemPromise)
                .to.emit(poolToken, "RedeemedAPT")
                .withArgs(
                  randomUser.address,
                  underlyer.address,
                  underlyerTransferAmount,
                  aptAmount,
                  tokenEthValue,
                  poolEthValue
                );
            });
          });

          describe("Test for dust", () => {
            it("getUnderlyerAmount after calculateMintAmount results in small dust", async () => {
              // increase APT total supply
              await poolToken.mint(
                deployer.address,
                tokenAmountToBigNumber("100000")
              );
              // seed pool with stablecoin
              await acquireToken(
                STABLECOIN_POOLS[symbol],
                poolToken.address,
                underlyer,
                "12000000", // 12 MM
                deployer.address
              );

              const depositAmount = tokenAmountToBigNumber(
                "1",
                await underlyer.decimals()
              );
              const mintAmount = await poolToken.calculateMintAmount(
                depositAmount
              );
              let trx = await poolToken
                .connect(randomUser)
                .addLiquidity(depositAmount);
              await trx.wait();
              const underlyerAmount = await poolToken.getUnderlyerAmount(
                mintAmount
              );
              expect(underlyerAmount).to.not.equal(depositAmount);
              const tolerance = Math.floor((await underlyer.decimals()) / 4);
              const allowedDeviation = tokenAmountToBigNumber(1, tolerance);
              expect(Math.abs(underlyerAmount.sub(depositAmount))).to.be.lt(
                allowedDeviation
              );
            });
          });
        });
      });
    });
  });
});
