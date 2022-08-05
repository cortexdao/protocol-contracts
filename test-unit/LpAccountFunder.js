const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, artifacts, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const {
  FAKE_ADDRESS,
  tokenAmountToBigNumber,
  bytes32,
  deepEqual,
} = require("../utils/helpers");
const { deployMockContract } = waffle;
const OracleAdapter = artifacts.readArtifactSync("OracleAdapter");
const IDetailedERC20 = artifacts.readArtifactSync("IDetailedERC20");

describe("Contract: LpAccountFunder", () => {
  // signers
  let deployer;
  let emergencySafe;
  let lpSafe;
  let lpAccount;
  let randomUser;

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
    [, , , , randomUser] = await ethers.getSigners();

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
    const LpAccountFunder = await ethers.getContractFactory(
      "TestLpAccountFunder"
    );
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

    it("Index Token set correctly", async () => {
      expect(await lpAccountFunder.indexToken()).to.equal(indexToken.address);
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

  describe("fund and withdraw", () => {
    let asset;

    before("Setup mocks", async () => {
      await indexToken.mock.transferToLpAccount.returns();
      await indexToken.mock.getAssetPrice.returns(
        tokenAmountToBigNumber("0.998", 8)
      );

      asset = await deployMockContract(deployer, IDetailedERC20.abi);
      await indexToken.mock.asset.returns(asset.address);

      await asset.mock.decimals.returns(18);

      await lpAccount.mock.transferToPool.returns();

      await oracleAdapter.mock.getTvl.returns(
        tokenAmountToBigNumber("12345678", 8)
      );
    });

    describe("_registerPoolUnderlyer", () => {
      beforeEach("Setup mocks", async () => {
        await asset.mock.symbol.returns("3CRV");
      });

      it("Unregistered asset get registered", async () => {
        // set asset as unregistered in ERC20 registry
        await erc20Allocation.mock["isErc20TokenRegistered(address)"]
          .withArgs(asset.address)
          .returns(false);

        // revert on registration
        await erc20Allocation.mock["registerErc20Token(address)"].returns();
        await erc20Allocation.mock["registerErc20Token(address)"]
          .withArgs(asset.address)
          .revertsWithReason("TEST_REGISTER_ASSET");

        // expect revert since register function should be called
        await expect(
          lpAccountFunder.testRegisterPoolUnderlyer()
        ).to.be.revertedWith("TEST_REGISTER_ASSET");
      });

      it("Registered asset is skipped", async () => {
        // set asset as registered in ERC20 registry
        await erc20Allocation.mock["isErc20TokenRegistered(address)"]
          .withArgs(asset.address)
          .returns(true);

        // revert on registration
        await erc20Allocation.mock["registerErc20Token(address)"].returns();
        await erc20Allocation.mock["registerErc20Token(address)"]
          .withArgs(asset.address)
          .revertsWithReason("TEST_SKIP_REGISTER");

        // should not revert since asset is already registered
        await expect(lpAccountFunder.testRegisterPoolUnderlyer()).to.not.be
          .reverted;
      });
    });

    describe("fundLpAccount", () => {
      before(async () => {
        await indexToken.mock.getReserveTopUpValue.returns(0);
      });

      it("LP Safe can call", async () => {
        await expect(lpAccountFunder.connect(lpSafe).fundLpAccount()).to.not.be
          .reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          lpAccountFunder.connect(randomUser).fundLpAccount()
        ).to.be.revertedWith("NOT_LP_ROLE");
      });

      it("Revert on unregistered LP Account address", async () => {
        await addressRegistry.mock.lpAccountAddress.returns(ZERO_ADDRESS);
        await expect(
          lpAccountFunder.connect(lpSafe).fundLpAccount()
        ).to.be.revertedWith("INVALID_LP_ACCOUNT");
      });
    });

    describe("withdrawFromLpAccount", () => {
      before(async () => {
        await indexToken.mock.getReserveTopUpValue.returns(0);
        await asset.mock.balanceOf.returns(0);
      });

      it("LP Safe can call", async () => {
        await expect(lpAccountFunder.connect(lpSafe).withdrawFromLpAccount()).to
          .not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          lpAccountFunder.connect(randomUser).withdrawFromLpAccount()
        ).to.be.revertedWith("NOT_LP_ROLE");
      });
    });

    describe("getRebalanceAmount", () => {
      it("Delegates to vault function", async () => {
        const vaultRebalanceAmount = tokenAmountToBigNumber("1234888", "18");
        await indexToken.mock.getReserveTopUpValue.returns(
          vaultRebalanceAmount
        );

        const result = await lpAccountFunder.getRebalanceAmount();
        expect(result).to.equal(vaultRebalanceAmount);
      });
    });

    describe("getLpAccountBalance", () => {
      it("Return array of available stablecoin balances of LP Account", async () => {
        const availableAmount = tokenAmountToBigNumber("15325", "18");
        await asset.mock.balanceOf
          .withArgs(lpAccount.address)
          .returns(availableAmount);

        const result = await lpAccountFunder.getLpAccountBalance();
        expect(result).to.equal(availableAmount);
      });
    });

    describe("_getFundAmount", () => {
      it("Replaces negatives with positives, positives with zeros", async () => {
        let amount = tokenAmountToBigNumber("159");
        let expectedResult = tokenAmountToBigNumber("0");
        let result = await lpAccountFunder.testGetFundAmount(amount);
        deepEqual(expectedResult, result);

        amount = tokenAmountToBigNumber("-159");
        expectedResult = tokenAmountToBigNumber("159");
        result = await lpAccountFunder.testGetFundAmount(amount);
        deepEqual(expectedResult, result);
      });
    });

    describe("_calculateAmountToWithdraw", () => {
      it("Replaces negatives with zeros", async () => {
        let topupAmount = tokenAmountToBigNumber("159");
        let availableAmount = topupAmount;
        let expectedResult = topupAmount;
        let result = await lpAccountFunder.testCalculateAmountToWithdraw(
          topupAmount,
          availableAmount
        );

        deepEqual(expectedResult, result);

        topupAmount = tokenAmountToBigNumber("-11");
        expectedResult = tokenAmountToBigNumber("0");
        availableAmount = expectedResult;
        result = await lpAccountFunder.testCalculateAmountToWithdraw(
          topupAmount,
          availableAmount
        );
        deepEqual(expectedResult, result);
      });

      it("Uses minimum of topup and available amounts", async () => {
        let topupAmount = tokenAmountToBigNumber("159");
        let availableAmount = tokenAmountToBigNumber("122334");
        let expectedResult = topupAmount;
        let result = await lpAccountFunder.testCalculateAmountToWithdraw(
          topupAmount,
          availableAmount
        );
        deepEqual(expectedResult, result);
      });
    });
  });
});
