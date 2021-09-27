const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, web3, artifacts, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const {
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
  tokenAmountToBigNumber,
  bytes32,
  impersonateAccount,
  forciblySendEth,
} = require("../utils/helpers");
const { deployMockContract } = waffle;
const OracleAdapter = artifacts.readArtifactSync("OracleAdapter");
const PoolTokenV2 = artifacts.readArtifactSync("PoolTokenV2");
const IDetailedERC20 = artifacts.readArtifactSync("IDetailedERC20");

const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);

const usdc = (amount) => tokenAmountToBigNumber(amount, "6");
const ether = (amount) => tokenAmountToBigNumber(amount, "18");

describe("Contract: MetaPoolToken", () => {
  // signers
  let deployer;
  let emergencySafe;
  let lpSafe;
  let lpAccount;
  let randomUser;
  let anotherUser;

  // deployed contracts
  let mApt;

  // mocks
  let adminSafe;
  let oracleAdapter;
  let addressRegistry;
  let erc20Allocation;

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

  before("Setup mock Address Registry with Mainnet address", async () => {
    [deployer] = await ethers.getSigners();

    const MAINNET_ADDRESS_REGISTRY_DEPLOYER =
      "0x720edBE8Bb4C3EA38F370bFEB429D715b48801e3";
    const owner = await impersonateAccount(MAINNET_ADDRESS_REGISTRY_DEPLOYER);
    await forciblySendEth(
      owner.address,
      tokenAmountToBigNumber(10),
      deployer.address
    );
    // Set the nonce to 3 before deploying the mock contract with the
    // Mainnet registry deployer; this will ensure the mock address
    // matches Mainnet.
    await hre.network.provider.send("hardhat_setNonce", [
      MAINNET_ADDRESS_REGISTRY_DEPLOYER,
      "0x3",
    ]);
    addressRegistry = await deployMockContract(
      owner,
      artifacts.readArtifactSync("AddressRegistryV2").abi
    );
  });

  before("Register Safes", async () => {
    [, emergencySafe, lpSafe] = await ethers.getSigners();

    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("lpSafe"))
      .returns(lpSafe.address);

    // mock the Admin Safe to allow module function calls
    adminSafe = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IGnosisModuleManager").abi
    );
    await adminSafe.mock.execTransactionFromModule.returns(true);
    // register the address
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("adminSafe"))
      .returns(adminSafe.address);
  });

  before("Deploy mAPT", async () => {
    mApt = await deployMetaPoolToken(addressRegistry);
  });

  before("Mock dependencies", async () => {
    [, , , randomUser, anotherUser] = await ethers.getSigners();

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
  });

  async function deployMetaPoolToken(addressRegistry) {
    const ProxyAdminFactory = await ethers.getContractFactory(
      "ProxyAdminFactory"
    );
    const proxyAdminFactory = await ProxyAdminFactory.deploy();

    const ProxyFactory = await ethers.getContractFactory("ProxyFactory");
    const proxyFactory = await ProxyFactory.deploy();

    const MetaPoolTokenFactory = await ethers.getContractFactory(
      "TestMetaPoolTokenFactory"
    );
    const mAptFactory = await MetaPoolTokenFactory.deploy();

    const AlphaDeployment = await ethers.getContractFactory(
      "TestAlphaDeployment"
    );
    const alphaDeployment = await AlphaDeployment.deploy(
      proxyAdminFactory.address,
      proxyFactory.address,
      FAKE_ADDRESS, // address registry v2 factory
      mAptFactory.address, // mAPT factory
      FAKE_ADDRESS, // pool token v1 factory
      FAKE_ADDRESS, // pool token v2 factory
      FAKE_ADDRESS, // tvl manager factory
      FAKE_ADDRESS, // oracle adapter factory
      FAKE_ADDRESS // lp account factory
    );

    await addressRegistry.mock.owner.returns(adminSafe.address);
    await alphaDeployment.testSetStep(1);

    await addressRegistry.mock.registerAddress.returns();

    await alphaDeployment.deploy_1_MetaPoolToken();

    const proxyAddress = await alphaDeployment.mApt();
    mApt = await ethers.getContractAt("TestMetaPoolToken", proxyAddress);

    return mApt;
  }

  describe("Constructor", () => {
    let MetaPoolTokenProxy;
    let logic;

    before(async () => {
      MetaPoolTokenProxy = await ethers.getContractFactory(
        "MetaPoolTokenProxy"
      );
      const MetaPoolToken = await ethers.getContractFactory("MetaPoolToken");
      logic = await MetaPoolToken.deploy();
    });

    it("Revert when logic is not a contract address", async () => {
      const contractAddress = (await deployMockContract(deployer, [])).address;
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          DUMMY_ADDRESS,
          contractAddress,
          contractAddress
        )
      ).to.be.revertedWith(
        "UpgradeableProxy: new implementation is not a contract"
      );
    });

    it("Revert when proxy admin is zero address", async () => {
      const contractAddress = (await deployMockContract(deployer, [])).address;
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          logic.address,
          ZERO_ADDRESS,
          contractAddress
        )
      ).to.be.revertedWith("INVALID_ADMIN");
    });

    it("Revert when address registry is not a contract address", async () => {
      const contractAddress = (await deployMockContract(deployer, [])).address;
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          logic.address,
          contractAddress,
          DUMMY_ADDRESS
        )
      ).to.be.revertedWith("INVALID_ADDRESS");
    });
  });

  describe("Defaults", () => {
    it("Default admin role given to Emergency Safe", async () => {
      const DEFAULT_ADMIN_ROLE = await mApt.DEFAULT_ADMIN_ROLE();
      const memberCount = await mApt.getRoleMemberCount(DEFAULT_ADMIN_ROLE);
      expect(memberCount).to.equal(1);
      expect(await mApt.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)).to
        .be.true;
    });

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await mApt.LP_ROLE();
      const memberCount = await mApt.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await mApt.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await mApt.EMERGENCY_ROLE();
      const memberCount = await mApt.getRoleMemberCount(EMERGENCY_ROLE);
      expect(memberCount).to.equal(1);
      expect(await mApt.hasRole(EMERGENCY_ROLE, emergencySafe.address)).to.be
        .true;
    });

    it("Name set to correct value", async () => {
      expect(await mApt.name()).to.equal("APY MetaPool Token");
    });

    it("Symbol set to correct value", async () => {
      expect(await mApt.symbol()).to.equal("mAPT");
    });

    it("Decimals set to correct value", async () => {
      expect(await mApt.decimals()).to.equal(18);
    });

    it("Admin set correctly", async () => {
      // get admin address from slot specified by EIP-1967
      let proxyAdminAddress = await ethers.provider.getStorageAt(
        mApt.address,
        "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
      );
      proxyAdminAddress = ethers.utils.getAddress(proxyAdminAddress.slice(-40));
      expect(await mApt.proxyAdmin()).to.equal(proxyAdminAddress);
    });

    it("Address registry set correctly", async () => {
      expect(await mApt.addressRegistry()).to.equal(addressRegistry.address);
    });
  });

  describe("emergencySetAddressRegistry", () => {
    it("Emergency Safe can set to valid address", async () => {
      const contractAddress = (await deployMockContract(deployer, [])).address;
      await mApt
        .connect(emergencySafe)
        .emergencySetAddressRegistry(contractAddress);
      expect(await mApt.addressRegistry()).to.equal(contractAddress);
    });

    it("Revert when unpermissioned attempts to set", async () => {
      const contractAddress = (await deployMockContract(deployer, [])).address;
      await expect(
        mApt.connect(randomUser).emergencySetAddressRegistry(contractAddress)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Cannot set to non-contract address", async () => {
      await expect(
        mApt.connect(emergencySafe).emergencySetAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });
  });

  describe("emergencySetAdminAddress", () => {
    it("Emergency Safe can set to valid address", async () => {
      await mApt
        .connect(emergencySafe)
        .emergencySetAdminAddress(randomUser.address);
      expect(await mApt.proxyAdmin()).to.equal(randomUser.address);
    });

    it("Revert when unpermissioned attempts to set", async () => {
      await expect(
        mApt.connect(randomUser).emergencySetAdminAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        mApt.connect(emergencySafe).emergencySetAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });
  });

  describe("_mintAndTransfer", () => {
    it("No minting or transfers for zero mint amount", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await pool.mock.transferToLpAccount.reverts();

      const mintAmount = 0;
      const transferAmount = 100;

      const prevTotalSupply = await mApt.totalSupply();
      await expect(
        mApt.testMintAndTransfer(pool.address, mintAmount, transferAmount)
      ).to.not.be.reverted;
      expect(await mApt.totalSupply()).to.equal(prevTotalSupply);
    });

    it("Transfer if there is minting", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);

      const mintAmount = tokenAmountToBigNumber(10, await mApt.decimals());
      const transferAmount = 100;

      // check pool's transfer funciton gets called
      await pool.mock.transferToLpAccount.revertsWithReason(
        "TRANSFER_TO_LP_SAFE"
      );
      await expect(
        mApt.testMintAndTransfer(pool.address, mintAmount, transferAmount)
      ).to.be.revertedWith("TRANSFER_TO_LP_SAFE");

      const expectedSupply = (await mApt.totalSupply()).add(mintAmount);
      // reset pool mock to check if supply changes as expected
      await pool.mock.transferToLpAccount.returns();
      await mApt.testMintAndTransfer(pool.address, mintAmount, transferAmount);
      expect(await mApt.totalSupply()).to.equal(expectedSupply);
    });

    it("No minting if transfer reverts", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await pool.mock.transferToLpAccount.revertsWithReason("TRANSFER_FAILED");

      const mintAmount = tokenAmountToBigNumber(10, await mApt.decimals());
      const transferAmount = 100;

      const prevTotalSupply = await mApt.totalSupply();
      await expect(
        mApt.testMintAndTransfer(pool.address, mintAmount, transferAmount)
      ).to.be.revertedWith("TRANSFER_FAILED");
      expect(await mApt.totalSupply()).to.equal(prevTotalSupply);
    });
  });

  describe("_burnAndTransfer", () => {
    it("No burning or transfers for zero burn amount", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await pool.mock.underlyer.reverts();

      const burnAmount = 0;
      const transferAmount = 100;

      const prevTotalSupply = await mApt.totalSupply();
      await expect(
        mApt.testBurnAndTransfer(
          pool.address,
          lpSafe.address,
          burnAmount,
          transferAmount
        )
      ).to.not.be.reverted;
      expect(await mApt.totalSupply()).to.equal(prevTotalSupply);
    });

    it("Transfer if there is burning", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);

      const burnAmount = tokenAmountToBigNumber(10, await mApt.decimals());
      const transferAmount = 100;

      await mApt.testMint(pool.address, burnAmount);

      // check lpAccount's transfer function gets called
      await lpAccount.mock.transferToPool.revertsWithReason(
        "CALLED_LPACCOUNT_TRANSFER"
      );
      await expect(
        mApt.testBurnAndTransfer(
          pool.address,
          lpAccount.address,
          burnAmount,
          transferAmount
        )
      ).to.be.revertedWith("CALLED_LPACCOUNT_TRANSFER");

      const expectedSupply = (await mApt.totalSupply()).sub(burnAmount);
      // reset lpAccount mock to check if supply changes as expected
      await lpAccount.mock.transferToPool.returns();
      await mApt.testBurnAndTransfer(
        pool.address,
        lpAccount.address,
        burnAmount,
        transferAmount
      );
      expect(await mApt.totalSupply()).to.equal(expectedSupply);
    });

    it("No burning if transfer reverts", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await lpAccount.mock.transferToPool.revertsWithReason(
        "LPACCOUNT_TRANSFER_FAILED"
      );

      const burnAmount = tokenAmountToBigNumber(10, await mApt.decimals());
      const transferAmount = 100;

      await mApt.testMint(pool.address, burnAmount);

      const prevTotalSupply = await mApt.totalSupply();
      await expect(
        mApt.testBurnAndTransfer(
          pool.address,
          lpAccount.address,
          burnAmount,
          transferAmount
        )
      ).to.be.revertedWith("LPACCOUNT_TRANSFER_FAILED");
      expect(await mApt.totalSupply()).to.equal(prevTotalSupply);
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
        const expectedMintAmount = await mApt.testCalculateDelta(
          transferAmount,
          price,
          decimals
        );
        const prevBalance = await mApt.balanceOf(pool.address);
        const expectedBalance = prevBalance.add(expectedMintAmount);

        await mApt.testMultipleMintAndTransfer(
          [pool.address],
          [transferAmount]
        );
        expect(await mApt.balanceOf(pool.address)).to.equal(expectedBalance);
      });

      it("Locks after minting", async () => {
        const transferAmount = 100;

        await oracleAdapter.mock.lock.revertsWithReason("ORACLE_LOCKED");
        await expect(
          mApt.testMultipleMintAndTransfer([pool.address], [transferAmount])
        ).to.be.revertedWith("ORACLE_LOCKED");
      });
    });

    describe("_multipleBurnAndTransfer", () => {
      it("Burns calculated amount", async () => {
        // make supply non-zero so burn calc will use proper share logic,
        // not the default multiplier.
        await mApt.testMint(pool.address, tokenAmountToBigNumber("1105"));

        const price = await pool.getUnderlyerPrice();
        const decimals = await underlyer.decimals();
        const transferAmount = tokenAmountToBigNumber("1988", decimals);
        const expectedBurnAmount = await mApt.testCalculateDelta(
          transferAmount,
          price,
          decimals
        );

        const prevBalance = await mApt.balanceOf(pool.address);
        const expectedBalance = prevBalance.sub(expectedBurnAmount);

        await mApt.testMultipleBurnAndTransfer(
          [pool.address],
          [transferAmount]
        );
        expect(await mApt.balanceOf(pool.address)).to.equal(expectedBalance);
      });

      it("Locks after burning", async () => {
        // make supply non-zero so burn calc will use proper share logic,
        // not the default multiplier.
        await mApt.testMint(pool.address, tokenAmountToBigNumber("1105"));

        const decimals = await underlyer.decimals();
        const transferAmount = tokenAmountToBigNumber("100", decimals);

        await oracleAdapter.mock.lock.revertsWithReason("ORACLE_LOCKED");
        await expect(
          mApt.testMultipleBurnAndTransfer([pool.address], [transferAmount])
        ).to.be.revertedWith("ORACLE_LOCKED");
      });
    });
  });

  describe("Calculations", () => {
    describe("getDeployedValue", () => {
      it("Return 0 if zero mAPT supply", async () => {
        expect(await mApt.totalSupply()).to.equal("0");
        expect(await mApt.getDeployedValue(FAKE_ADDRESS)).to.equal("0");
      });

      it("Return 0 if zero mAPT balance", async () => {
        await mApt.testMint(FAKE_ADDRESS, tokenAmountToBigNumber(1000));
        expect(await mApt.getDeployedValue(ANOTHER_FAKE_ADDRESS)).to.equal(0);
      });

      it("Returns calculated value for non-zero mAPT balance", async () => {
        const tvl = ether("502300");
        const balance = tokenAmountToBigNumber("1000");
        const anotherBalance = tokenAmountToBigNumber("12345");
        const totalSupply = balance.add(anotherBalance);

        await oracleAdapter.mock.getTvl.returns(tvl);
        await mApt.testMint(FAKE_ADDRESS, balance);
        await mApt.testMint(ANOTHER_FAKE_ADDRESS, anotherBalance);

        const expectedValue = tvl.mul(balance).div(totalSupply);
        expect(await mApt.getDeployedValue(FAKE_ADDRESS)).to.equal(
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

        await mApt.testMint(anotherUser.address, tokenAmountToBigNumber(100));

        const mintAmount = await mApt.testCalculateDelta(
          usdcAmount,
          usdcEthPrice,
          "6"
        );
        const expectedMintAmount = usdcValue.mul(
          await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
        );
        expect(mintAmount).to.be.equal(expectedMintAmount);
      });

      it("Calculate mint amount with zero total supply", async () => {
        const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
        let usdcAmount = usdc(107);
        let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
        await oracleAdapter.mock.getTvl.returns(1);

        const mintAmount = await mApt.testCalculateDelta(
          usdcAmount,
          usdcEthPrice,
          "6"
        );
        const expectedMintAmount = usdcValue.mul(
          await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
        );
        expect(mintAmount).to.be.equal(expectedMintAmount);
      });

      it("Calculate mint amount with non-zero total supply", async () => {
        const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
        let usdcAmount = usdc(107);
        let tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
        await oracleAdapter.mock.getTvl.returns(tvl);

        const totalSupply = tokenAmountToBigNumber(21);
        await mApt.testMint(anotherUser.address, totalSupply);

        let mintAmount = await mApt.testCalculateDelta(
          usdcAmount,
          usdcEthPrice,
          "6"
        );
        expect(mintAmount).to.be.equal(totalSupply);

        tvl = usdcEthPrice.mul(usdcAmount.mul(2)).div(usdc(1));
        await oracleAdapter.mock.getTvl.returns(tvl);
        const expectedMintAmount = totalSupply.div(2);
        mintAmount = await mApt.testCalculateDelta(
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
          mApt.testCalculateDeltas(pools, amounts)
        ).to.be.revertedWith("LENGTHS_MUST_MATCH");
      });

      it("Return an empty array when given empty arrays", async () => {
        const result = await mApt.testCalculateDeltas([], []);
        expect(result).to.deep.equal([]);
      });

      it("Returns expected amounts from _calculateDelta", async () => {
        const amounts = [
          tokenAmountToBigNumber(384, 18), // DAI
          tokenAmountToBigNumber(9899, 6), // Tether
        ];
        const expectedAmounts = [
          await mApt.testCalculateDelta(amounts[0], underlyerPrice, 18),
          await mApt.testCalculateDelta(amounts[1], underlyerPrice, 6),
        ];

        const result = await mApt.testCalculateDeltas(
          [pools[0], pools[2]],
          amounts
        );
        expect(result[0]).to.equal(expectedAmounts[0]);
        expect(result[1]).to.equal(expectedAmounts[1]);
        expect(result).to.deep.equal(expectedAmounts);
      });

      it("Get zero mint amount for zero transfer", async () => {
        const amounts = [0, tokenAmountToBigNumber(347, 6), 0];
        const result = await mApt.testCalculateDeltas(pools, amounts);

        const expectedAmount = await mApt.testCalculateDelta(
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
      expect(await mApt.testGetTvl()).to.equal(usdTvl);
    });

    it("getTvl reverts with same reason as oracle adapter", async () => {
      await oracleAdapter.mock.getTvl.revertsWithReason("SOMETHING_WRONG");
      await expect(mApt.testGetTvl()).to.be.revertedWith("SOMETHING_WRONG");
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
        mApt.testRegisterPoolUnderlyers([daiPool.address])
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
      await expect(mApt.testRegisterPoolUnderlyers([daiPool.address])).to.not.be
        .reverted;

      // should revert for USDC registration
      await expect(
        mApt.testRegisterPoolUnderlyers([daiPool.address, usdcPool.address])
      ).to.be.revertedWith("REGISTERED_USDC");
    });
  });

  describe("fundLpAccount", () => {
    it("LP Safe can call", async () => {
      // await expect(mApt.connect(lpSafe).fundLpAccount([])).to.not.be.reverted;
      await mApt.connect(lpSafe).fundLpAccount([]);
    });

    it("Unpermissioned cannot call", async () => {
      await expect(
        mApt.connect(randomUser).fundLpAccount([])
      ).to.be.revertedWith("NOT_LP_ROLE");
    });

    it("Revert on unregistered LP Account address", async () => {
      await addressRegistry.mock.lpAccountAddress.returns(ZERO_ADDRESS);
      await expect(mApt.connect(lpSafe).fundLpAccount([])).to.be.revertedWith(
        "INVALID_LP_ACCOUNT"
      );
    });
  });

  describe("withdrawFromLpAccount", () => {
    it("LP Safe can call", async () => {
      await expect(mApt.connect(lpSafe).withdrawFromLpAccount([])).to.not.be
        .reverted;
    });

    it("Unpermissioned cannot call", async () => {
      await expect(
        mApt.connect(randomUser).withdrawFromLpAccount([])
      ).to.be.revertedWith("NOT_LP_ROLE");
    });

    it("Revert on unregistered LP Account address", async () => {
      await addressRegistry.mock.lpAccountAddress.returns(ZERO_ADDRESS);
      await expect(
        mApt.connect(lpSafe).withdrawFromLpAccount([])
      ).to.be.revertedWith("INVALID_LP_ACCOUNT");
    });
  });

  describe("emergencyFundLpAccount", () => {
    it("Emergency Safe can call", async () => {
      await expect(mApt.connect(emergencySafe).emergencyFundLpAccount([], []))
        .to.not.be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      await expect(
        mApt.connect(randomUser).emergencyFundLpAccount([], [])
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Revert on unregistered LP Account address", async () => {
      await addressRegistry.mock.lpAccountAddress.returns(ZERO_ADDRESS);
      await expect(
        mApt.connect(emergencySafe).emergencyFundLpAccount([], [])
      ).to.be.revertedWith("INVALID_LP_ACCOUNT");
    });
  });

  describe("emergencyWithdrawFromLpAccount", () => {
    it("Emergency Safe can call", async () => {
      await expect(
        mApt.connect(emergencySafe).emergencyWithdrawFromLpAccount([], [])
      ).to.not.be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      await expect(
        mApt.connect(randomUser).emergencyWithdrawFromLpAccount([], [])
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Revert on unregistered LP Account address", async () => {
      await addressRegistry.mock.lpAccountAddress.returns(ZERO_ADDRESS);
      await expect(
        mApt.connect(emergencySafe).emergencyWithdrawFromLpAccount([], [])
      ).to.be.revertedWith("INVALID_LP_ACCOUNT");
    });
  });

  describe("getRebalanceAmounts", () => {
    it("Return pair of empty arrays when give an empty array", async () => {
      const result = await mApt.getRebalanceAmounts([]);
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

      const result = await mApt.getRebalanceAmounts([
        bytes32("daiPool"),
        bytes32("usdcPool"),
      ]);
      expect(result).to.deep.equal([
        [daiPool.address, usdcPool.address],
        [daiRebalanceAmount, usdcRebalanceAmount],
      ]);
    });
  });

  describe("_getFundAmounts", () => {
    it("Returns empty array given empty array", async () => {
      const result = await mApt.testGetFundAmounts([]);
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
      let result = await mApt.testGetFundAmounts(amounts);
      expect(result).to.deep.equal(expectedResult);

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
      result = await mApt.testGetFundAmounts(amounts);
      expect(result).to.deep.equal(expectedResult);

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
      result = await mApt.testGetFundAmounts(amounts);
      expect(result).to.deep.equal(expectedResult);
    });
  });

  describe("_getWithdrawAmounts", () => {
    it("Returns empty array given empty array", async () => {
      const result = await mApt.testGetWithdrawAmounts([]);
      expect(result).to.be.empty;
    });

    it("Replaces negatives with zeros", async () => {
      let amounts = [
        tokenAmountToBigNumber("159"),
        tokenAmountToBigNumber("1777"),
        tokenAmountToBigNumber("11"),
        tokenAmountToBigNumber("122334"),
      ];
      let expectedResult = amounts;
      let result = await mApt.testGetWithdrawAmounts(amounts);
      expect(result).to.deep.equal(expectedResult);

      amounts = [
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
      result = await mApt.testGetWithdrawAmounts(amounts);
      expect(result).to.deep.equal(expectedResult);
    });
  });
});
