const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  bytes32,
  tokenAmountToBigNumber,
  getStablecoinAddress,
  acquireToken,
  deepEqual,
} = require("../utils/helpers");
const { WHALE_POOLS, FARM_TOKENS } = require("../utils/constants");

const IAddressRegistryV2 = artifacts.readArtifactSync("IAddressRegistryV2");
const IDetailedERC20 = artifacts.readArtifactSync("IDetailedERC20");
const IAssetAllocation = artifacts.readArtifactSync("IAssetAllocation");
const OracleAdapter = artifacts.readArtifactSync("OracleAdapter");

async function deployMockZap(name) {
  const TestZap = await ethers.getContractFactory("TestZap");
  const zap = await TestZap.deploy(name || "mockZap");
  return zap;
}

async function deployMockSwap(name) {
  const TestSwap = await ethers.getContractFactory("TestSwap");
  const swap = await TestSwap.deploy(name || "mockSwap");
  return swap;
}

async function deployMockAllocation(name) {
  const [deployer] = await ethers.getSigners();
  const allocation = await deployMockContract(deployer, IAssetAllocation.abi);
  await allocation.mock.NAME.returns(name || "mockAllocation");
  return allocation;
}

async function deployMockErc20(symbol, decimals) {
  const [deployer] = await ethers.getSigners();
  const token = await deployMockContract(deployer, IDetailedERC20.abi);
  await token.mock.symbol.returns(symbol || "MOCK");
  await token.mock.decimals.returns(Number(decimals) || 18);
  return token;
}

describe("Contract: LpAccount", () => {
  // signers
  let deployer;
  let lpSafe;
  let emergencySafe;
  let adminSafe;
  let mApt;
  let randomUser;

  // deployed contracts
  let lpAccount;
  let proxyAdmin;
  let tvlManager;
  let erc20Allocation;

  // mocks
  let addressRegistry;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Setup mock address registry", async () => {
    [deployer, lpSafe, emergencySafe, adminSafe, mApt, randomUser] =
      await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      IAddressRegistryV2.abi
    );

    // These registered addresses are setup for roles in the
    // constructor for LpAccount
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.mAptAddress.returns(mApt.address);
  });

  before("Deploy LP Account", async () => {
    const ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    proxyAdmin = await ProxyAdmin.deploy();

    const LpAccount = await ethers.getContractFactory("TestLpAccount");
    const logic = await LpAccount.deploy();

    const initData = LpAccount.interface.encodeFunctionData(
      "initialize(address)",
      [addressRegistry.address]
    );

    const TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    const proxy = await TransparentUpgradeableProxy.deploy(
      logic.address,
      proxyAdmin.address,
      initData
    );

    lpAccount = await LpAccount.attach(proxy.address);
  });

  before("Prepare TVL Manager and ERC20 Allocation", async () => {
    // deploy and register TVL Manager
    const TvlManager = await ethers.getContractFactory("TvlManager", adminSafe);
    tvlManager = await TvlManager.deploy(addressRegistry.address);

    await addressRegistry.mock.getAddress
      .withArgs(bytes32("tvlManager"))
      .returns(tvlManager.address);

    // Oracle Adapter is locked after adding/removing allocations
    const oracleAdapter = await deployMockContract(deployer, OracleAdapter.abi);
    await oracleAdapter.mock.lock.returns();
    await oracleAdapter.mock.lockFor.returns();
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    // deploy and register ERC20 allocation
    const Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    erc20Allocation = await Erc20Allocation.deploy(addressRegistry.address);

    await tvlManager.registerAssetAllocation(erc20Allocation.address);
  });

  describe("deployStrategy", () => {
    it("can deploy with empty allocations arrays", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      await lpAccount.connect(lpSafe).deployStrategy(name, amounts);
      const result = await lpAccount._deployCalls();
      deepEqual([amounts], result);
    });

    it("cannot deploy with unregistered allocation", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with unregistered allocation
      const allocation = await deployMockAllocation();
      await zap._setAssetAllocations([allocation.address]);

      await expect(
        lpAccount.connect(lpSafe).deployStrategy(name, amounts)
      ).to.be.revertedWith("MISSING_ASSET_ALLOCATIONS");
    });

    it("cannot deploy with registered and unregistered allocations", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with a registered and an unregistered allocation
      const allocation_0 = await deployMockAllocation("allocation 0");
      const allocation_1 = await deployMockAllocation("allocation 1");
      await tvlManager.registerAssetAllocation(allocation_1.address);
      await zap._setAssetAllocations([
        allocation_0.address,
        allocation_1.address,
      ]);

      await expect(
        lpAccount.connect(lpSafe).deployStrategy(name, amounts)
      ).to.be.revertedWith("MISSING_ASSET_ALLOCATIONS");
    });

    it("can deploy with registered allocations", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with registered allocations
      const allocation_0 = await deployMockAllocation("allocation 0");
      const allocation_1 = await deployMockAllocation("allocation 1");
      await tvlManager.registerAssetAllocation(allocation_0.address);
      await tvlManager.registerAssetAllocation(allocation_1.address);
      await zap._setAssetAllocations([
        await allocation_0.NAME(),
        await allocation_1.NAME(),
      ]);

      await lpAccount.connect(lpSafe).deployStrategy(name, amounts);
      const result = await lpAccount._deployCalls();

      deepEqual(amounts, result);
    });

    it("cannot deploy with unregistered ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with unregistered ERC20
      const token = await deployMockErc20();
      await zap._setErc20Allocations([token.address]);

      await expect(
        lpAccount.connect(lpSafe).deployStrategy(name, amounts)
      ).to.be.revertedWith("MISSING_ERC20_ALLOCATIONS");
    });

    it("can deploy with registered ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with registered ERC20
      const token = await deployMockErc20();
      await erc20Allocation
        .connect(adminSafe)
        ["registerErc20Token(address)"](token.address);
      await zap._setErc20Allocations([token.address]);

      await lpAccount.connect(lpSafe).deployStrategy(name, amounts);
      const result = await lpAccount._deployCalls();
      deepEqual([amounts], result);
    });

    it("can deploy with registered allocation and ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with registered allocation
      const allocation = await deployMockAllocation();
      await tvlManager.registerAssetAllocation(allocation.address);
      await zap._setAssetAllocations([await allocation.NAME()]);

      // configure zap with registered ERC20
      const token = await deployMockErc20();
      await erc20Allocation
        .connect(adminSafe)
        ["registerErc20Token(address)"](token.address);
      await zap._setErc20Allocations([token.address]);

      await lpAccount.connect(lpSafe).deployStrategy(name, amounts);
      const result = await lpAccount._deployCalls();
      deepEqual([amounts], result);
    });

    it("cannot deploy with registered allocation but unregistered ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with registered allocation
      const allocation = await deployMockAllocation();
      await tvlManager.registerAssetAllocation(allocation.address);
      await zap._setAssetAllocations([await allocation.NAME()]);

      // configure zap with unregistered ERC20
      const token = await deployMockErc20();
      await zap._setErc20Allocations([token.address]);

      await expect(
        lpAccount.connect(lpSafe).deployStrategy(name, amounts)
      ).to.be.revertedWith("MISSING_ERC20_ALLOCATIONS");
    });

    it("cannot deploy with unregistered allocation but registered ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amounts = [
        tokenAmountToBigNumber(1),
        tokenAmountToBigNumber(2),
        tokenAmountToBigNumber(3),
      ];

      // configure zap with unregistered allocation
      const allocation = await deployMockAllocation();
      await zap._setAssetAllocations([allocation.address]);

      // configure zap with registered ERC20
      const token = await deployMockErc20();
      await erc20Allocation
        .connect(adminSafe)
        ["registerErc20Token(address)"](token.address);
      await zap._setErc20Allocations([token.address]);

      await expect(
        lpAccount.connect(lpSafe).deployStrategy(name, amounts)
      ).to.be.revertedWith("MISSING_ASSET_ALLOCATIONS");
    });
  });

  describe("unwindStrategy", () => {
    it("can unwind", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();
      const amount = tokenAmountToBigNumber(100);
      const index = 2;

      await lpAccount.connect(lpSafe).unwindStrategy(name, amount, index);
      const result = await lpAccount._unwindCalls();
      const resultValues = result.map((x) => x.toString());
      expect(resultValues).to.deep.equal([amount.toString()]);
    });
  });

  describe("claim", () => {
    it("can claim with empty ERC20 array", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();

      await lpAccount.connect(lpSafe).claim(name);
      expect(await lpAccount._claimsCounter()).to.equal(1);
    });

    it("can claim with registered ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();

      // configure zap with registered ERC20
      const token = await deployMockErc20();
      await erc20Allocation
        .connect(adminSafe)
        ["registerErc20Token(address)"](token.address);
      await zap._setErc20Allocations([token.address]);

      await lpAccount.connect(lpSafe).claim(name);
      expect(await lpAccount._claimsCounter()).to.equal(1);
    });

    it("cannot claim with unregistered ERC20", async () => {
      const zap = await deployMockZap();
      await lpAccount.connect(adminSafe).registerZap(zap.address);

      const name = await zap.NAME();

      // configure zap with unregistered ERC20
      const token = await deployMockErc20();
      await zap._setErc20Allocations([token.address]);

      await expect(lpAccount.connect(lpSafe).claim(name)).to.be.revertedWith(
        "MISSING_ERC20_ALLOCATIONS"
      );
    });
  });

  describe("transferToPool", () => {
    let pool;
    let underlyer;

    before("Setup mock pool with underlyer", async () => {
      pool = await deployMockContract(
        deployer,
        artifacts.readArtifactSync("ILiquidityPoolV2").abi
      );
      const daiAddress = await getStablecoinAddress("DAI", "MAINNET");
      underlyer = await ethers.getContractAt("IDetailedERC20", daiAddress);

      await pool.mock.underlyer.returns(underlyer.address);

      // fund LP Account with DAI
      await acquireToken(
        WHALE_POOLS["DAI"],
        lpAccount.address,
        underlyer,
        "10000",
        deployer.address
      );
    });

    it("can transfer", async () => {
      expect(await underlyer.balanceOf(pool.address)).to.equal(0);

      const amount = tokenAmountToBigNumber("100", 18);
      await expect(lpAccount.connect(mApt).transferToPool(pool.address, amount))
        .to.not.be.reverted;

      expect(await underlyer.balanceOf(pool.address)).to.equal(amount);
    });
  });

  describe("swap", () => {
    it("can swap with empty ERC20s array", async () => {
      const swap = await deployMockSwap();
      await lpAccount.connect(adminSafe).registerSwap(swap.address);

      const name = await swap.NAME();
      const amount = tokenAmountToBigNumber(1);

      await lpAccount.connect(lpSafe).swap(name, amount, 0);
      const result = await lpAccount._swapCalls();
      const resultValues = result.map((x) => x.toString());
      expect(resultValues).to.deep.equal([amount.toString()]);
    });

    it("cannot swap with unregistered ERC20", async () => {
      const swap = await deployMockSwap();
      await lpAccount.connect(adminSafe).registerSwap(swap.address);

      const name = await swap.NAME();
      const amount = tokenAmountToBigNumber(1);

      // configure swap with unregistered ERC20
      const token = await deployMockErc20();
      await swap._setErc20Allocations([token.address]);

      await expect(
        lpAccount.connect(lpSafe).swap(name, amount, 0)
      ).to.be.revertedWith("MISSING_ERC20_ALLOCATIONS");
    });

    it("can swap with registered ERC20", async () => {
      const swap = await deployMockSwap();
      await lpAccount.connect(adminSafe).registerSwap(swap.address);

      const name = await swap.NAME();
      const amount = tokenAmountToBigNumber(1);

      // configure swap with registered ERC20
      const token = await deployMockErc20();
      await erc20Allocation
        .connect(adminSafe)
        ["registerErc20Token(address)"](token.address);
      await swap._setErc20Allocations([token.address]);

      await expect(lpAccount.connect(lpSafe).swap(name, amount, 0)).to.not.be
        .reverted;
    });
  });

  describe("swapWith3Pool", () => {
    const stableSwapAddress = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7";
    const amount = "10000";
    const tokens = ["DAI", "USDC", "USDT"];

    let stableSwap;

    before("Fund LP Account with tokens", async () => {
      await Promise.all(
        tokens.map(async (symbol) => {
          const tokenAddress = await getStablecoinAddress(symbol, "MAINNET");
          const token = await ethers.getContractAt(
            "IDetailedERC20",
            tokenAddress
          );

          await acquireToken(
            WHALE_POOLS[symbol],
            lpAccount.address,
            token,
            amount,
            deployer.address
          );
        })
      );
    });

    before("Connect to StableSwap contract", async () => {
      stableSwap = await ethers.getContractAt("IStableSwap", stableSwapAddress);
    });

    it("should be callable by the LP Safe", async () => {
      const inTokenAmount = tokenAmountToBigNumber(amount);
      await expect(
        lpAccount.connect(lpSafe).swapWith3Pool(0, 1, inTokenAmount, 0)
      ).to.not.be.reverted;
    });

    it("should not be callable by other addresses", async () => {
      const tokenAmount = tokenAmountToBigNumber(amount);
      await expect(
        lpAccount.connect(randomUser).swapWith3Pool(0, 1, tokenAmount, 0)
      ).to.be.revertedWith("NOT_LP_ROLE");
    });

    tokens.forEach((inTokenSymbol, inIndex) => {
      tokens.forEach((outTokenSymbol, outIndex) => {
        if (inTokenSymbol !== outTokenSymbol) {
          it(`can swap from ${inTokenSymbol} to ${outTokenSymbol}`, async () => {
            const inTokenAddress = await getStablecoinAddress(
              inTokenSymbol,
              "MAINNET"
            );
            const inToken = await ethers.getContractAt(
              "IDetailedERC20",
              inTokenAddress
            );

            const inDecimals = await inToken.decimals();
            const inTokenAmount = tokenAmountToBigNumber(amount, inDecimals);

            const outTokenAddress = await getStablecoinAddress(
              outTokenSymbol,
              "MAINNET"
            );
            const outToken = await ethers.getContractAt(
              "IDetailedERC20",
              outTokenAddress
            );

            const prevInTokenBalance = await inToken.balanceOf(
              lpAccount.address
            );
            const prevOutTokenBalance = await outToken.balanceOf(
              lpAccount.address
            );

            const dy = await stableSwap.get_dy(
              inIndex,
              outIndex,
              inTokenAmount
            );

            const minOutTokenAmount = dy.mul(99).div(100);

            await lpAccount
              .connect(lpSafe)
              .swapWith3Pool(
                inIndex,
                outIndex,
                inTokenAmount,
                minOutTokenAmount
              );

            const newInTokenBalance = await inToken.balanceOf(
              lpAccount.address
            );
            const newOutTokenBalance = await outToken.balanceOf(
              lpAccount.address
            );

            expect(prevInTokenBalance.sub(newInTokenBalance)).to.equal(
              inTokenAmount
            );

            expect(newOutTokenBalance.sub(prevOutTokenBalance)).to.be.gt(
              minOutTokenAmount
            );
          });

          it(`cannot swap from ${inTokenSymbol} to ${outTokenSymbol} when minimum amount is too high`, async () => {
            const inTokenAddress = await getStablecoinAddress(
              inTokenSymbol,
              "MAINNET"
            );
            const inToken = await ethers.getContractAt(
              "IDetailedERC20",
              inTokenAddress
            );

            const inDecimals = await inToken.decimals();
            const inTokenAmount = tokenAmountToBigNumber(amount, inDecimals);

            const outTokenAddress = await getStablecoinAddress(
              outTokenSymbol,
              "MAINNET"
            );
            const outToken = await ethers.getContractAt(
              "IDetailedERC20",
              outTokenAddress
            );

            const dy = await stableSwap.get_dy(
              inIndex,
              outIndex,
              inTokenAmount
            );

            const minOutTokenAmount = dy.add(1);

            await expect(
              lpAccount
                .connect(lpSafe)
                .swapWith3Pool(
                  inIndex,
                  outIndex,
                  inTokenAmount,
                  minOutTokenAmount
                )
            ).to.be.reverted;
          });
        }
      });
    });
  });

  describe("emergencyExit", () => {
    const symbol = "AAVE";
    let token;

    before("Get token", async () => {
      token = await ethers.getContractAt("IDetailedERC20", FARM_TOKENS[symbol]);
    });

    beforeEach("Acquire token", async () => {
      await acquireToken(
        WHALE_POOLS[symbol],
        lpAccount.address,
        token,
        "10000",
        deployer.address
      );
    });

    it("Should only be callable by the emergencySafe", async () => {
      await expect(
        lpAccount.connect(randomUser).emergencyExit(token.address)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");

      await expect(
        lpAccount.connect(emergencySafe).emergencyExit(token.address)
      ).to.not.be.reverted;
    });

    it.skip("Should transfer all funded tokens to the emergencySafe", async () => {});

    it("Should transfer tokens airdropped to the LpAccount", async () => {
      const prevPoolBalance = await token.balanceOf(lpAccount.address);
      const prevSafeBalance = await token.balanceOf(emergencySafe.address);

      await lpAccount.connect(emergencySafe).emergencyExit(token.address);

      const nextPoolBalance = await token.balanceOf(lpAccount.address);
      const nextSafeBalance = await token.balanceOf(emergencySafe.address);

      expect(nextPoolBalance).to.equal(0);
      expect(nextSafeBalance.sub(prevSafeBalance)).to.equal(prevPoolBalance);
    });

    it("Should emit the EmergencyExit event", async () => {
      const balance = await token.balanceOf(lpAccount.address);

      await expect(
        lpAccount.connect(emergencySafe).emergencyExit(token.address)
      )
        .to.emit(lpAccount, "EmergencyExit")
        .withArgs(emergencySafe.address, token.address, balance);
    });
  });
});
