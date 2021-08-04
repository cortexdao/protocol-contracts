const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS, bytes32 } = require("../utils/helpers");

describe.only("Contract: TvlManager", () => {
  // signers
  let deployer;
  let poolManager;
  let lpSafe;
  let emergencySafe;
  let randomUser;
  let randomAddress;

  // contract factories
  let TvlManager;

  // deployed contracts
  let tvlManager;
  // mocks
  let addressRegistry;
  let erc20Allocation;
  let oracleAdapter;
  let erc20Mock;

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
    [
      deployer,
      poolManager,
      lpSafe,
      emergencySafe,
      randomUser,
      randomAddress,
    ] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IAddressRegistryV2").abi
    );

    oracleAdapter = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IOracleAdapter").abi
    );
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );
    await oracleAdapter.mock.lock.returns();

    // These registered addresses are setup for roles in the
    // constructor for TvlManager
    await addressRegistry.mock.poolManagerAddress.returns(poolManager.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    erc20Allocation = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("Erc20Allocation").abi
    );
    erc20Mock = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IDetailedERC20").abi
    );
    await erc20Mock.mock.symbol.returns("MOCK");
    await erc20Mock.mock.decimals.returns(6);
    await erc20Mock.mock.balanceOf.withArgs(randomUser.address).returns(123e6);
    await erc20Allocation.mock.isErc20TokenRegistered
      .withArgs(erc20Mock.address)
      .returns(true);
    await erc20Allocation.mock.isErc20TokenRegistered
      .withArgs(randomUser.address)
      .returns(false);
    await erc20Allocation.mock.tokens.returns([
      { token: erc20Mock.address, symbol: "MOCK", decimals: 6 },
    ]);

    TvlManager = await ethers.getContractFactory("TestTvlManager");
    tvlManager = await TvlManager.deploy(
      addressRegistry.address,
      erc20Allocation.address
    );
    await tvlManager.deployed();
  });

  describe("Defaults", () => {
    it("Default admin role given to Emergency Safe", async () => {
      const DEFAULT_ADMIN_ROLE = await tvlManager.DEFAULT_ADMIN_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(
        DEFAULT_ADMIN_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(
        await tvlManager.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)
      ).to.be.true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await tvlManager.EMERGENCY_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(EMERGENCY_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(EMERGENCY_ROLE, emergencySafe.address)).to
        .be.true;
    });

    it("Contract role given to Pool Manager", async () => {
      const CONTRACT_ROLE = await tvlManager.CONTRACT_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(CONTRACT_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(CONTRACT_ROLE, poolManager.address)).to.be
        .true;
    });

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await tvlManager.LP_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });

    it("ERC20 allocation was set", async () => {
      // Check if the ERC20 allocation address was set by removing it, which should fail
      await expect(
        tvlManager
          .connect(lpSafe)
          .removeAssetAllocation(erc20Allocation.address)
      ).to.be.revertedWith("CANNOT_REMOVE_ALLOCATION");
    });
  });

  describe("ERC20 allocations", () => {
    it("ERC20 allocations can be checked", async () => {
      expect(await tvlManager.isErc20TokenRegistered(erc20Mock.address)).to.be
        .true;

      expect(await tvlManager.isErc20TokenRegistered(randomUser.address)).to.be
        .false;
    });

    it("ERC20 Allocation cannot be removed", async () => {
      await expect(
        tvlManager
          .connect(lpSafe)
          .removeAssetAllocation(erc20Allocation.address)
      ).to.be.revertedWith("CANNOT_REMOVE_ALLOCATION");
    });
  });

  describe("Asset allocation IDs", () => {
    describe("encodeAssetAllocationId", () => {
      it("should pack the address and index into a bytes32", async () => {
        const address = randomUser.address;
        const tokenIndex = 2;

        const result = await tvlManager.testEncodeAssetAllocationId(
          address,
          tokenIndex
        );

        const pack = ethers.utils.solidityPack(
          ["address", "uint8"],
          [address, tokenIndex]
        );
        const id = `${pack}0000000000000000000000`;
        expect(result).to.equal(id);
      });
    });

    describe("decodeAssetAllocationId", () => {
      it("should decode an ID into an address and index", async () => {
        const address = randomUser.address;
        const tokenIndex = 2;
        const id = await tvlManager.testEncodeAssetAllocationId(
          address,
          tokenIndex
        );
        const result = await tvlManager.testDecodeAssetAllocationId(id);
        expect(result).to.deep.equal([address, tokenIndex]);
      });

      it("should decode an ID when the index is large", async () => {
        const address = randomUser.address;
        const tokenIndex = 200;
        const id = await tvlManager.testEncodeAssetAllocationId(
          address,
          tokenIndex
        );
        const result = await tvlManager.testDecodeAssetAllocationId(id);
        expect(result).to.deep.equal([address, tokenIndex]);
      });

      it("should decode an ID when the address is zero", async () => {
        const address = ZERO_ADDRESS;
        const tokenIndex = 200;
        const id = await tvlManager.testEncodeAssetAllocationId(
          address,
          tokenIndex
        );
        const result = await tvlManager.testDecodeAssetAllocationId(id);
        expect(result).to.deep.equal([address, tokenIndex]);
      });
    });

    describe("getAssetAllocationId(s)", async () => {
      let mockAssetAllocation;
      let mockAsset;

      before("register asset allocations", async () => {
        mockAssetAllocation = await deployMockContract(
          deployer,
          artifacts.readArtifactSync("Erc20Allocation").abi
        );
        mockAsset = await deployMockContract(
          deployer,
          artifacts.readArtifactSync("IDetailedERC20").abi
        );
        await mockAsset.mock.symbol.returns("MOCK");
        await mockAsset.mock.decimals.returns(6);
        await mockAsset.mock.balanceOf
          .withArgs(randomUser.address)
          .returns(123e6);
        await mockAssetAllocation.mock.isErc20TokenRegistered
          .withArgs(mockAsset.address)
          .returns(true);
        await mockAssetAllocation.mock.isErc20TokenRegistered
          .withArgs(randomUser.address)
          .returns(false);
        await mockAssetAllocation.mock.tokens.returns([
          { token: mockAsset.address, symbol: "MOCK", decimals: 6 },
        ]);

        await tvlManager
          .connect(poolManager)
          .registerAssetAllocation(mockAssetAllocation.address);
      });

      it("should fail on invalid asset allocation", async () => {
        await expect(
          tvlManager.getAssetAllocationId(randomAddress.address, 4)
        ).to.be.revertedWith("INVALID_ASSET_ALLOCATION");
      });

      it("should fail with invalid token index", async () => {});

      it("should successfully get the asset allocation id", async () => {});
    });
  });
});
