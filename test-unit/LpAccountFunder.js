const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, artifacts, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const {
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
  tokenAmountToBigNumber,
  bytes32,
  deepEqual,
} = require("../utils/helpers");
const { deployMockContract } = waffle;
const OracleAdapter = artifacts.readArtifactSync("OracleAdapter");
const PoolTokenV2 = artifacts.readArtifactSync("PoolTokenV2");
const IDetailedERC20 = artifacts.readArtifactSync("IDetailedERC20");

const usdc = (amount) => tokenAmountToBigNumber(amount, "6");
const ether = (amount) => tokenAmountToBigNumber(amount, "18");

describe.only("Contract: LpAccountFunder", () => {
  // signers
  let deployer;
  let emergencySafe;
  let lpSafe;
  let lpAccount;
  let randomUser;
  let anotherUser;

  // deployed contracts
  let lpAccountFunder;

  // mocks
  let adminSafe;
  let oracleAdapter;
  let addressRegistry;
  let erc20Allocation;
  let indexToken;

  // use EVM snapshots for test isolation
  let testSnapshotId;
  let suiteSnapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    testSnapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(testSnapshotId);
  });

  before(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    suiteSnapshotId = snapshot["result"];
  });

  after(async () => {
    // In particular, we need to reset the Mainnet accounts, otherwise
    // this will cause leakage into other test suites.  Doing a `beforeEach`
    // instead is viable but makes tests noticeably slower.
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  before("Setup address registry", async () => {
    [deployer] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("AddressRegistryV2").abi
    );
  });

  before("Register Safes", async () => {
    [, emergencySafe, adminSafe, lpSafe] = await ethers.getSigners();

    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("lpSafe"))
      .returns(lpSafe.address);

    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("adminSafe"))
      .returns(adminSafe.address);
  });

  before("Mock dependencies", async () => {
    [, , , , randomUser, anotherUser] = await ethers.getSigners();

    oracleAdapter = await deployMockContract(deployer, OracleAdapter.abi);
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );

    // allows mAPT to mint and burn
    await oracleAdapter.mock.lock.returns();

    lpAccount = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ILpAccount").abi
    );
    await addressRegistry.mock.lpAccountAddress.returns(lpAccount.address);

    erc20Allocation = await deployMockContract(
      deployer,
      artifacts.require("IErc20Allocation").abi
    );
    await erc20Allocation.mock["isErc20TokenRegistered(address)"].returns(true);

    const tvlManager = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IAssetAllocationRegistry").abi
    );
    await tvlManager.mock.getAssetAllocation
      .withArgs("erc20Allocation")
      .returns(erc20Allocation.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("tvlManager"))
      .returns(tvlManager.address);

    indexToken = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IndexToken").abi
    );
  });

  before("Deploy LpAccountFunder", async () => {
    const LpAccountFunder = await ethers.getContractFactory("LpAccountFunder");
    lpAccountFunder = await LpAccountFunder.deploy(
      addressRegistry.address,
      indexToken.address
    );
    await lpAccountFunder.deployed();
  });

  describe("Defaults", () => {
    it("Default admin role given to Emergency Safe", async () => {
      const DEFAULT_ADMIN_ROLE = await lpAccountFunder.DEFAULT_ADMIN_ROLE();
      const memberCount = await lpAccountFunder.getRoleMemberCount(
        DEFAULT_ADMIN_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(
        await lpAccountFunder.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)
      ).to.be.true;
    });

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await lpAccountFunder.LP_ROLE();
      const memberCount = await lpAccountFunder.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await lpAccountFunder.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await lpAccountFunder.EMERGENCY_ROLE();
      const memberCount = await lpAccountFunder.getRoleMemberCount(
        EMERGENCY_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(
        await lpAccountFunder.hasRole(EMERGENCY_ROLE, emergencySafe.address)
      ).to.be.true;
    });

    it("Address Registry set correctly", async () => {
      expect(await lpAccountFunder.addressRegistry()).to.equal(
        addressRegistry.address
      );
    });
  });

  describe("emergencySetAddressRegistry", () => {
    it("Emergency Safe can set to valid address", async () => {
      const contractAddress = (await deployMockContract(deployer, [])).address;
      await lpAccountFunder
        .connect(emergencySafe)
        .emergencySetAddressRegistry(contractAddress);
      expect(await lpAccountFunder.addressRegistry()).to.equal(contractAddress);
    });

    it("Revert when unpermissioned attempts to set", async () => {
      const contractAddress = (await deployMockContract(deployer, [])).address;
      await expect(
        lpAccountFunder
          .connect(randomUser)
          .emergencySetAddressRegistry(contractAddress)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Cannot set to non-contract address", async () => {
      await expect(
        lpAccountFunder
          .connect(emergencySafe)
          .emergencySetAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });
  });

  describe("_mintAndTransfer", () => {
    it("No minting or transfers for zero mint amount", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await pool.mock.transferToLpAccount.reverts();

      const mintAmount = 0;
      const transferAmount = 100;

      const prevTotalSupply = await lpAccountFunder.totalSupply();
      await expect(
        lpAccountFunder.testMintAndTransfer(
          pool.address,
          mintAmount,
          transferAmount
        )
      ).to.not.be.reverted;
      expect(await lpAccountFunder.totalSupply()).to.equal(prevTotalSupply);
    });

    it("Transfer if there is minting", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);

      const mintAmount = tokenAmountToBigNumber(
        10,
        await lpAccountFunder.decimals()
      );
      const transferAmount = 100;

      // check pool's transfer funciton gets called
      await pool.mock.transferToLpAccount.revertsWithReason(
        "TRANSFER_TO_LP_SAFE"
      );
      await expect(
        lpAccountFunder.testMintAndTransfer(
          pool.address,
          mintAmount,
          transferAmount
        )
      ).to.be.revertedWith("TRANSFER_TO_LP_SAFE");

      const expectedSupply = (await lpAccountFunder.totalSupply()).add(
        mintAmount
      );
      // reset pool mock to check if supply changes as expected
      await pool.mock.transferToLpAccount.returns();
      await lpAccountFunder.testMintAndTransfer(
        pool.address,
        mintAmount,
        transferAmount
      );
      expect(await lpAccountFunder.totalSupply()).to.equal(expectedSupply);
    });

    it("No minting if transfer reverts", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await pool.mock.transferToLpAccount.revertsWithReason("TRANSFER_FAILED");

      const mintAmount = tokenAmountToBigNumber(
        10,
        await lpAccountFunder.decimals()
      );
      const transferAmount = 100;

      const prevTotalSupply = await lpAccountFunder.totalSupply();
      await expect(
        lpAccountFunder.testMintAndTransfer(
          pool.address,
          mintAmount,
          transferAmount
        )
      ).to.be.revertedWith("TRANSFER_FAILED");
      expect(await lpAccountFunder.totalSupply()).to.equal(prevTotalSupply);
    });
  });

  describe("_burnAndTransfer", () => {
    it("No burning or transfers for zero burn amount", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await pool.mock.underlyer.reverts();

      const burnAmount = 0;
      const transferAmount = 100;

      const prevTotalSupply = await lpAccountFunder.totalSupply();
      await expect(
        lpAccountFunder.testBurnAndTransfer(
          pool.address,
          lpSafe.address,
          burnAmount,
          transferAmount
        )
      ).to.not.be.reverted;
      expect(await lpAccountFunder.totalSupply()).to.equal(prevTotalSupply);
    });

    it("Transfer if there is burning", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);

      const burnAmount = tokenAmountToBigNumber(
        10,
        await lpAccountFunder.decimals()
      );
      const transferAmount = 100;

      await lpAccountFunder.testMint(pool.address, burnAmount);

      // check lpAccount's transfer function gets called
      await lpAccount.mock.transferToPool.revertsWithReason(
        "CALLED_LPACCOUNT_TRANSFER"
      );
      await expect(
        lpAccountFunder.testBurnAndTransfer(
          pool.address,
          lpAccount.address,
          burnAmount,
          transferAmount
        )
      ).to.be.revertedWith("CALLED_LPACCOUNT_TRANSFER");

      const expectedSupply = (await lpAccountFunder.totalSupply()).sub(
        burnAmount
      );
      // reset lpAccount mock to check if supply changes as expected
      await lpAccount.mock.transferToPool.returns();
      await lpAccountFunder.testBurnAndTransfer(
        pool.address,
        lpAccount.address,
        burnAmount,
        transferAmount
      );
      expect(await lpAccountFunder.totalSupply()).to.equal(expectedSupply);
    });

    it("No burning if transfer reverts", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await lpAccount.mock.transferToPool.revertsWithReason(
        "LPACCOUNT_TRANSFER_FAILED"
      );

      const burnAmount = tokenAmountToBigNumber(
        10,
        await lpAccountFunder.decimals()
      );
      const transferAmount = 100;

      await lpAccountFunder.testMint(pool.address, burnAmount);

      const prevTotalSupply = await lpAccountFunder.totalSupply();
      await expect(
        lpAccountFunder.testBurnAndTransfer(
          pool.address,
          lpAccount.address,
          burnAmount,
          transferAmount
        )
      ).to.be.revertedWith("LPACCOUNT_TRANSFER_FAILED");
      expect(await lpAccountFunder.totalSupply()).to.equal(prevTotalSupply);
    });
  });

  describe("Multiple mints and burns", () => {
    let pool;
    let underlyer;

    before("Setup mocks", async () => {
      pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await pool.mock.transferToLpAccount.returns();
      await pool.mock.getUnderlyerPrice.returns(
        tokenAmountToBigNumber("0.998", 8)
      );

      underlyer = await deployMockContract(deployer, IDetailedERC20.abi);
      await pool.mock.underlyer.returns(underlyer.address);

      await underlyer.mock.decimals.returns(6);

      await lpAccount.mock.transferToPool.returns();

      await oracleAdapter.mock.getTvl.returns(
        tokenAmountToBigNumber("12345678", 8)
      );
    });

    describe("_multipleMintAndTransfer", () => {
      it("Mints calculated amount", async () => {
        const price = await pool.getUnderlyerPrice();
        const decimals = await underlyer.decimals();
        const transferAmount = tokenAmountToBigNumber("1988", decimals);
        const expectedMintAmount = await lpAccountFunder.testCalculateDelta(
          transferAmount,
          price,
          decimals
        );
        const prevBalance = await lpAccountFunder.balanceOf(pool.address);
        const expectedBalance = prevBalance.add(expectedMintAmount);

        await lpAccountFunder.testMultipleMintAndTransfer(
          [pool.address],
          [transferAmount]
        );
        expect(await lpAccountFunder.balanceOf(pool.address)).to.equal(
          expectedBalance
        );
      });

      it("Locks after minting", async () => {
        const transferAmount = 100;

        await oracleAdapter.mock.lock.revertsWithReason("ORACLE_LOCKED");
        await expect(
          lpAccountFunder.testMultipleMintAndTransfer(
            [pool.address],
            [transferAmount]
          )
        ).to.be.revertedWith("ORACLE_LOCKED");
      });
    });

    describe("_multipleBurnAndTransfer", () => {
      it("Burns calculated amount", async () => {
        // make supply non-zero so burn calc will use proper share logic,
        // not the default multiplier.
        await lpAccountFunder.testMint(
          pool.address,
          tokenAmountToBigNumber("1105")
        );

        const price = await pool.getUnderlyerPrice();
        const decimals = await underlyer.decimals();
        const transferAmount = tokenAmountToBigNumber("1988", decimals);
        const expectedBurnAmount = await lpAccountFunder.testCalculateDelta(
          transferAmount,
          price,
          decimals
        );

        const prevBalance = await lpAccountFunder.balanceOf(pool.address);
        const expectedBalance = prevBalance.sub(expectedBurnAmount);

        await lpAccountFunder.testMultipleBurnAndTransfer(
          [pool.address],
          [transferAmount]
        );
        expect(await lpAccountFunder.balanceOf(pool.address)).to.equal(
          expectedBalance
        );
      });

      it("Locks after burning", async () => {
        // make supply non-zero so burn calc will use proper share logic,
        // not the default multiplier.
        await lpAccountFunder.testMint(
          pool.address,
          tokenAmountToBigNumber("1105")
        );

        const decimals = await underlyer.decimals();
        const transferAmount = tokenAmountToBigNumber("100", decimals);

        await oracleAdapter.mock.lock.revertsWithReason("ORACLE_LOCKED");
        await expect(
          lpAccountFunder.testMultipleBurnAndTransfer(
            [pool.address],
            [transferAmount]
          )
        ).to.be.revertedWith("ORACLE_LOCKED");
      });
    });
  });

  describe("Calculations", () => {
    describe("getDeployedValue", () => {
      it("Return 0 if zero mAPT supply", async () => {
        expect(await lpAccountFunder.totalSupply()).to.equal("0");
        expect(await lpAccountFunder.getDeployedValue(FAKE_ADDRESS)).to.equal(
          "0"
        );
      });

      it("Return 0 if zero mAPT balance", async () => {
        await lpAccountFunder.testMint(
          FAKE_ADDRESS,
          tokenAmountToBigNumber(1000)
        );
        expect(
          await lpAccountFunder.getDeployedValue(ANOTHER_FAKE_ADDRESS)
        ).to.equal(0);
      });

      it("Returns calculated value for non-zero mAPT balance", async () => {
        const tvl = ether("502300");
        const balance = tokenAmountToBigNumber("1000");
        const anotherBalance = tokenAmountToBigNumber("12345");
        const totalSupply = balance.add(anotherBalance);

        await oracleAdapter.mock.getTvl.returns(tvl);
        await lpAccountFunder.testMint(FAKE_ADDRESS, balance);
        await lpAccountFunder.testMint(ANOTHER_FAKE_ADDRESS, anotherBalance);

        const expectedValue = tvl.mul(balance).div(totalSupply);
        expect(await lpAccountFunder.getDeployedValue(FAKE_ADDRESS)).to.equal(
          expectedValue
        );
      });
    });

    describe("_calculateDelta", () => {
      it("Calculate mint amount with zero deployed TVL", async () => {
        const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
        let usdcAmount = usdc(107);
        let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
        await oracleAdapter.mock.getTvl.returns(0);

        await lpAccountFunder.testMint(
          anotherUser.address,
          tokenAmountToBigNumber(100)
        );

        const mintAmount = await lpAccountFunder.testCalculateDelta(
          usdcAmount,
          usdcEthPrice,
          "6"
        );
        const expectedMintAmount = usdcValue.mul(
          await lpAccountFunder.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
        );
        expect(mintAmount).to.be.equal(expectedMintAmount);
      });

      it("Calculate mint amount with zero total supply", async () => {
        const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
        let usdcAmount = usdc(107);
        let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
        await oracleAdapter.mock.getTvl.returns(1);

        const mintAmount = await lpAccountFunder.testCalculateDelta(
          usdcAmount,
          usdcEthPrice,
          "6"
        );
        const expectedMintAmount = usdcValue.mul(
          await lpAccountFunder.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
        );
        expect(mintAmount).to.be.equal(expectedMintAmount);
      });

      it("Calculate mint amount with non-zero total supply", async () => {
        const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
        let usdcAmount = usdc(107);
        let tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
        await oracleAdapter.mock.getTvl.returns(tvl);

        const totalSupply = tokenAmountToBigNumber(21);
        await lpAccountFunder.testMint(anotherUser.address, totalSupply);

        let mintAmount = await lpAccountFunder.testCalculateDelta(
          usdcAmount,
          usdcEthPrice,
          "6"
        );
        expect(mintAmount).to.be.equal(totalSupply);

        tvl = usdcEthPrice.mul(usdcAmount.mul(2)).div(usdc(1));
        await oracleAdapter.mock.getTvl.returns(tvl);
        const expectedMintAmount = totalSupply.div(2);
        mintAmount = await lpAccountFunder.testCalculateDelta(
          usdcAmount,
          usdcEthPrice,
          "6"
        );
        expect(mintAmount).to.be.equal(expectedMintAmount);
      });
    });

    describe("_calculateDeltas", () => {
      let pools;
      const underlyerPrice = tokenAmountToBigNumber("1.015", 8);

      before("Mock pools and underlyers", async () => {
        const daiPool = await deployMockContract(deployer, PoolTokenV2.abi);
        await daiPool.mock.getUnderlyerPrice.returns(underlyerPrice);
        const daiToken = await deployMockContract(deployer, IDetailedERC20.abi);
        await daiPool.mock.underlyer.returns(daiToken.address);
        await daiToken.mock.decimals.returns(18);

        const usdcPool = await deployMockContract(deployer, PoolTokenV2.abi);
        await usdcPool.mock.getUnderlyerPrice.returns(underlyerPrice);
        const usdcToken = await deployMockContract(
          deployer,
          IDetailedERC20.abi
        );
        await usdcPool.mock.underlyer.returns(usdcToken.address);
        await usdcToken.mock.decimals.returns(6);

        const usdtPool = await deployMockContract(deployer, PoolTokenV2.abi);
        await usdtPool.mock.getUnderlyerPrice.returns(underlyerPrice);
        const usdtToken = await deployMockContract(
          deployer,
          IDetailedERC20.abi
        );
        await usdtPool.mock.underlyer.returns(usdtToken.address);
        await usdtToken.mock.decimals.returns(6);

        pools = [daiPool.address, usdcPool.address, usdtPool.address];
      });

      before("Set TVL", async () => {
        const tvl = tokenAmountToBigNumber("502300", 8);
        await oracleAdapter.mock.getTvl.returns(tvl);
      });

      it("Revert if array lengths do not match", async () => {
        const amounts = new Array(pools.length - 1).fill(
          tokenAmountToBigNumber("1", "18")
        );

        await expect(
          lpAccountFunder.testCalculateDeltas(pools, amounts)
        ).to.be.revertedWith("LENGTHS_MUST_MATCH");
      });

      it("Return an empty array when given empty arrays", async () => {
        const result = await lpAccountFunder.testCalculateDeltas([], []);
        expect(result).to.deep.equal([]);
      });

      it("Returns expected amounts from _calculateDelta", async () => {
        const amounts = [
          tokenAmountToBigNumber(384, 18), // DAI
          tokenAmountToBigNumber(9899, 6), // Tether
        ];
        const expectedAmounts = [
          await lpAccountFunder.testCalculateDelta(
            amounts[0],
            underlyerPrice,
            18
          ),
          await lpAccountFunder.testCalculateDelta(
            amounts[1],
            underlyerPrice,
            6
          ),
        ];

        const result = await lpAccountFunder.testCalculateDeltas(
          [pools[0], pools[2]],
          amounts
        );
        expect(result[0]).to.equal(expectedAmounts[0]);
        expect(result[1]).to.equal(expectedAmounts[1]);
        expect(result).to.deep.equal(expectedAmounts);
      });

      it("Get zero mint amount for zero transfer", async () => {
        const amounts = [0, tokenAmountToBigNumber(347, 6), 0];
        const result = await lpAccountFunder.testCalculateDeltas(
          pools,
          amounts
        );

        const expectedAmount = await lpAccountFunder.testCalculateDelta(
          amounts[1],
          underlyerPrice,
          6
        );

        expect(result[0]).to.equal(0);
        expect(result[1]).to.be.equal(expectedAmount);
        expect(result[2]).to.equal(0);
      });
    });
  });

  describe("getTvl", () => {
    it("Call delegates to oracle adapter's getTvl", async () => {
      const usdTvl = tokenAmountToBigNumber("25100123.87654321", "8");
      await oracleAdapter.mock.getTvl.returns(usdTvl);
      expect(await lpAccountFunder.testGetTvl()).to.equal(usdTvl);
    });

    it("getTvl reverts with same reason as oracle adapter", async () => {
      await oracleAdapter.mock.getTvl.revertsWithReason("SOMETHING_WRONG");
      await expect(lpAccountFunder.testGetTvl()).to.be.revertedWith(
        "SOMETHING_WRONG"
      );
    });
  });

  describe("_registerPoolUnderlyers", () => {
    let daiPool;
    let daiToken;
    let usdcPool;
    let usdcToken;

    beforeEach("Setup mocks", async () => {
      daiPool = await deployMockContract(deployer, PoolTokenV2.abi);
      daiToken = await deployMockContract(deployer, IDetailedERC20.abi);
      await daiPool.mock.underlyer.returns(daiToken.address);
      await daiToken.mock.decimals.returns(18);
      await daiToken.mock.symbol.returns("DAI");

      usdcPool = await deployMockContract(deployer, PoolTokenV2.abi);
      usdcToken = await deployMockContract(deployer, IDetailedERC20.abi);
      await usdcPool.mock.underlyer.returns(usdcToken.address);
      await usdcToken.mock.decimals.returns(6);
      await usdcToken.mock.symbol.returns("USDC");
    });

    it("Unregistered underlyers get registered", async () => {
      // set DAI as unregistered in ERC20 registry
      await erc20Allocation.mock["isErc20TokenRegistered(address)"]
        .withArgs(daiToken.address)
        .returns(false);

      // revert on registration for DAI but not others
      await erc20Allocation.mock["registerErc20Token(address)"].returns();
      await erc20Allocation.mock["registerErc20Token(address)"]
        .withArgs(daiToken.address)
        .revertsWithReason("REGISTERED_DAI");

      // expect revert since register function should be called
      await expect(
        lpAccountFunder.testRegisterPoolUnderlyers([daiPool.address])
      ).to.be.revertedWith("REGISTERED_DAI");
    });

    it("Registered underlyers are skipped", async () => {
      // set DAI as registered while USDC is not
      await erc20Allocation.mock["isErc20TokenRegistered(address)"]
        .withArgs(daiToken.address)
        .returns(true);
      await erc20Allocation.mock["isErc20TokenRegistered(address)"]
        .withArgs(usdcToken.address)
        .returns(false);

      // revert on registration for DAI or USDC
      await erc20Allocation.mock["registerErc20Token(address)"].returns();
      await erc20Allocation.mock["registerErc20Token(address)"]
        .withArgs(usdcToken.address)
        .revertsWithReason("REGISTERED_USDC");
      await erc20Allocation.mock["registerErc20Token(address)"]
        .withArgs(daiToken.address)
        .revertsWithReason("REGISTERED_DAI");

      // should not revert since DAI should not be registered
      await expect(
        lpAccountFunder.testRegisterPoolUnderlyers([daiPool.address])
      ).to.not.be.reverted;

      // should revert for USDC registration
      await expect(
        lpAccountFunder.testRegisterPoolUnderlyers([
          daiPool.address,
          usdcPool.address,
        ])
      ).to.be.revertedWith("REGISTERED_USDC");
    });
  });

  describe("fundLpAccount", () => {
    it("LP Safe can call", async () => {
      // await expect(lpAccountFunder.connect(lpSafe).fundLpAccount([])).to.not.be.reverted;
      await lpAccountFunder.connect(lpSafe).fundLpAccount([]);
    });

    it("Unpermissioned cannot call", async () => {
      await expect(
        lpAccountFunder.connect(randomUser).fundLpAccount([])
      ).to.be.revertedWith("NOT_LP_ROLE");
    });

    it("Revert on unregistered LP Account address", async () => {
      await addressRegistry.mock.lpAccountAddress.returns(ZERO_ADDRESS);
      await expect(
        lpAccountFunder.connect(lpSafe).fundLpAccount([])
      ).to.be.revertedWith("INVALID_LP_ACCOUNT");
    });
  });

  describe("withdrawFromLpAccount", () => {
    it("LP Safe can call", async () => {
      await expect(lpAccountFunder.connect(lpSafe).withdrawFromLpAccount([])).to
        .not.be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      await expect(
        lpAccountFunder.connect(randomUser).withdrawFromLpAccount([])
      ).to.be.revertedWith("NOT_LP_ROLE");
    });

    it("Revert on unregistered LP Account address", async () => {
      await addressRegistry.mock.lpAccountAddress.returns(ZERO_ADDRESS);
      await expect(
        lpAccountFunder.connect(lpSafe).withdrawFromLpAccount([])
      ).to.be.revertedWith("INVALID_LP_ACCOUNT");
    });
  });

  describe("getRebalanceAmounts", () => {
    it("Return pair of empty arrays when give an empty array", async () => {
      const result = await lpAccountFunder.getRebalanceAmounts([]);
      expect(result).to.deep.equal([[], []]);
    });

    it("Return array of top-up PoolAmounts from specified pools", async () => {
      const daiPool = await deployMockContract(deployer, PoolTokenV2.abi);
      const daiRebalanceAmount = tokenAmountToBigNumber("1234888", "18");
      await daiPool.mock.getReserveTopUpValue.returns(daiRebalanceAmount);
      await addressRegistry.mock.getAddress
        .withArgs(bytes32("daiPool"))
        .returns(daiPool.address);

      const usdcPool = await deployMockContract(deployer, PoolTokenV2.abi);
      const usdcRebalanceAmount = tokenAmountToBigNumber("459999", "6");
      await usdcPool.mock.getReserveTopUpValue.returns(usdcRebalanceAmount);
      await addressRegistry.mock.getAddress
        .withArgs(bytes32("usdcPool"))
        .returns(usdcPool.address);

      const result = await lpAccountFunder.getRebalanceAmounts([
        bytes32("daiPool"),
        bytes32("usdcPool"),
      ]);
      deepEqual(result, [
        [daiPool.address, usdcPool.address],
        [daiRebalanceAmount, usdcRebalanceAmount],
      ]);
    });
  });

  describe("getLpAccountBalances", () => {
    it("Return empty array when given an empty array", async () => {
      const result = await lpAccountFunder.getLpAccountBalances([]);
      expect(result).to.deep.equal([]);
    });

    it("Return array of available stablecoin balances of LP Account", async () => {
      const daiToken = await deployMockContract(deployer, IDetailedERC20.abi);
      const daiAvailableAmount = tokenAmountToBigNumber("15325", "18");
      await daiToken.mock.balanceOf
        .withArgs(lpAccount.address)
        .returns(daiAvailableAmount);

      const daiPool = await deployMockContract(deployer, PoolTokenV2.abi);
      await daiPool.mock.underlyer.returns(daiToken.address);
      await addressRegistry.mock.getAddress
        .withArgs(bytes32("daiPool"))
        .returns(daiPool.address);

      const usdcToken = await deployMockContract(deployer, IDetailedERC20.abi);
      const usdcAvailableAmount = tokenAmountToBigNumber("110200", "6");
      await usdcToken.mock.balanceOf
        .withArgs(lpAccount.address)
        .returns(usdcAvailableAmount);

      const usdcPool = await deployMockContract(deployer, PoolTokenV2.abi);
      await usdcPool.mock.underlyer.returns(usdcToken.address);
      await addressRegistry.mock.getAddress
        .withArgs(bytes32("usdcPool"))
        .returns(usdcPool.address);

      const result = await lpAccountFunder.getLpAccountBalances([
        bytes32("daiPool"),
        bytes32("usdcPool"),
      ]);
      deepEqual(result, [daiAvailableAmount, usdcAvailableAmount]);
    });
  });

  describe("_getFundAmounts", () => {
    it("Returns empty array given empty array", async () => {
      const result = await lpAccountFunder.testGetFundAmounts([]);
      expect(result).to.be.empty;
    });

    it("Replaces negatives with positives, positives with zeros", async () => {
      let amounts = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("1777"),
        tokenAmountToBigNumber("11"),
        tokenAmountToBigNumber("122334"),
      ];
      let expectedResult = [
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("0"),
      ];
      let result = await lpAccountFunder.testGetFundAmounts(amounts);
      deepEqual(expectedResult, result);

      amounts = [
        tokenAmountToBigNumber("-159"),
        tokenAmountToBigNumber("-1777"),
        tokenAmountToBigNumber("-11"),
      ];
      expectedResult = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("1777"),
        tokenAmountToBigNumber("11"),
      ];
      result = await lpAccountFunder.testGetFundAmounts(amounts);
      deepEqual(expectedResult, result);

      amounts = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("-1777"),
        tokenAmountToBigNumber("-11"),
        tokenAmountToBigNumber("122334"),
        tokenAmountToBigNumber("0"),
      ];
      expectedResult = [
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("1777"),
        tokenAmountToBigNumber("11"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("0"),
      ];
      result = await lpAccountFunder.testGetFundAmounts(amounts);
      deepEqual(expectedResult, result);
    });
  });

  describe("_calculateAmountsToWithdraw", () => {
    it("Returns empty array given empty array", async () => {
      const result = await lpAccountFunder.testCalculateAmountsToWithdraw(
        [],
        []
      );
      expect(result).to.be.empty;
    });

    it("Replaces negatives with zeros", async () => {
      let topupAmounts = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("1777"),
        tokenAmountToBigNumber("11"),
        tokenAmountToBigNumber("122334"),
      ];
      let availableAmounts = topupAmounts;
      let expectedResult = topupAmounts;
      let result = await lpAccountFunder.testCalculateAmountsToWithdraw(
        topupAmounts,
        availableAmounts
      );

      deepEqual(expectedResult, result);

      topupAmounts = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("-1777"),
        tokenAmountToBigNumber("-11"),
        tokenAmountToBigNumber("122334"),
        tokenAmountToBigNumber("0"),
      ];
      expectedResult = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("122334"),
        tokenAmountToBigNumber("0"),
      ];
      availableAmounts = expectedResult;
      result = await lpAccountFunder.testCalculateAmountsToWithdraw(
        topupAmounts,
        availableAmounts
      );
      deepEqual(expectedResult, result);
    });

    it("Uses minimum of topup and available amounts", async () => {
      let topupAmounts = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("1777"),
        tokenAmountToBigNumber("11"),
        tokenAmountToBigNumber("122334"),
      ];
      let availableAmounts = [
        tokenAmountToBigNumber("122334"),
        tokenAmountToBigNumber("122334"),
        tokenAmountToBigNumber("122334"),
        tokenAmountToBigNumber("122334"),
      ];
      let expectedResult = topupAmounts;
      let result = await lpAccountFunder.testCalculateAmountsToWithdraw(
        topupAmounts,
        availableAmounts
      );
      deepEqual(expectedResult, result);

      topupAmounts = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("1777"),
        tokenAmountToBigNumber("11"),
        tokenAmountToBigNumber("122334"),
      ];
      availableAmounts = [
        tokenAmountToBigNumber("1000"),
        tokenAmountToBigNumber("1000"),
        tokenAmountToBigNumber("1000"),
        tokenAmountToBigNumber("1000"),
      ];
      expectedResult = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("1000"),
        tokenAmountToBigNumber("11"),
        tokenAmountToBigNumber("1000"),
      ];
      result = await lpAccountFunder.testCalculateAmountsToWithdraw(
        topupAmounts,
        availableAmounts
      );
      deepEqual(expectedResult, result);

      topupAmounts = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("-1777"),
        tokenAmountToBigNumber("-11"),
        tokenAmountToBigNumber("122334"),
        tokenAmountToBigNumber("0"),
      ];
      availableAmounts = [
        tokenAmountToBigNumber("1000"),
        tokenAmountToBigNumber("1"),
        tokenAmountToBigNumber("100"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("10000"),
        tokenAmountToBigNumber("10"),
      ];
      expectedResult = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("0"),
        tokenAmountToBigNumber("10000"),
        tokenAmountToBigNumber("0"),
      ];
      result = await lpAccountFunder.testCalculateAmountsToWithdraw(
        topupAmounts,
        availableAmounts
      );
      deepEqual(expectedResult, result);
    });
  });
});
