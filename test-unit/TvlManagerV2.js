const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS, FAKE_ADDRESS, bytes32 } = require("../utils/helpers");

async function generateContractAddress(signer) {
  const mockContract = await deployMockContract(signer, []);
  return mockContract.address;
}

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

  describe("Adding and removing asset allocations", () => {
    describe("registerAssetAllocation", () => {
      it("Pool manager can call", async () => {
        const contractAddress = await generateContractAddress(deployer);
        await expect(
          tvlManager
            .connect(poolManager)
            .registerAssetAllocation(contractAddress)
        ).to.not.be.reverted;
      });

      it("LP Safe can call", async () => {
        const contractAddress = await generateContractAddress(deployer);
        await expect(
          tvlManager.connect(lpSafe).registerAssetAllocation(contractAddress)
        ).to.not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        const contractAddress = await generateContractAddress(deployer);
        await expect(
          tvlManager
            .connect(randomUser)
            .registerAssetAllocation(contractAddress)
        ).to.be.revertedWith("INVALID_ACCESS_CONTROL");
      });

      it("Cannot register non-contract address", async () => {
        await expect(
          tvlManager.connect(lpSafe).registerAssetAllocation(FAKE_ADDRESS)
        ).to.be.revertedWith("INVALID_ADDRESS");
      });

      it("Correctly populates array of allocations", async () => {
        // always starts with 1 allocation, the ERC20 allocation
        let allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(1);
        expect(allocations).to.include(erc20Allocation.address);

        const contractAddress_0 = await generateContractAddress(deployer);
        const contractAddress_1 = await generateContractAddress(deployer);

        await tvlManager
          .connect(lpSafe)
          .registerAssetAllocation(contractAddress_0);
        allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(2);
        expect(allocations).to.include(erc20Allocation.address);
        expect(allocations).to.include(contractAddress_0);

        await tvlManager
          .connect(lpSafe)
          .registerAssetAllocation(contractAddress_1);
        allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(3);
        expect(allocations).to.include(erc20Allocation.address);
        expect(allocations).to.include(contractAddress_0);
        expect(allocations).to.include(contractAddress_1);

        // check no duplicates can be registered
        await tvlManager
          .connect(lpSafe)
          .registerAssetAllocation(contractAddress_0);
        allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(3);
        expect(allocations).to.include(erc20Allocation.address);
        expect(allocations).to.include(contractAddress_0);
        expect(allocations).to.include(contractAddress_1);
      });
    });

    describe("removeAssetAllocation", () => {
      it("Pool manager can call", async () => {
        await expect(
          tvlManager.connect(lpSafe).removeAssetAllocation(FAKE_ADDRESS)
        ).to.not.be.reverted;
      });

      it("LP Safe can call", async () => {
        await expect(
          tvlManager.connect(lpSafe).removeAssetAllocation(FAKE_ADDRESS)
        ).to.not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          tvlManager.connect(randomUser).registerAssetAllocation(FAKE_ADDRESS)
        ).to.be.revertedWith("INVALID_ACCESS_CONTROL");
      });

      it("Cannot remove ERC20 allocation", async () => {
        await expect(
          tvlManager
            .connect(lpSafe)
            .removeAssetAllocation(erc20Allocation.address)
        ).to.be.revertedWith("CANNOT_REMOVE_ALLOCATION");
      });

      it("Correctly removes allocation", async () => {
        const contractAddress_0 = await generateContractAddress(deployer);
        const contractAddress_1 = await generateContractAddress(deployer);

        // setup and assert preconditions
        await tvlManager
          .connect(lpSafe)
          .registerAssetAllocation(contractAddress_0);
        await tvlManager
          .connect(lpSafe)
          .registerAssetAllocation(contractAddress_1);

        let allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(3);
        expect(allocations).to.include(erc20Allocation.address);
        expect(allocations).to.include(contractAddress_0);
        expect(allocations).to.include(contractAddress_1);

        // start test
        await tvlManager
          .connect(lpSafe)
          .removeAssetAllocation(contractAddress_0);

        allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(2);
        expect(allocations).to.include(erc20Allocation.address);
        expect(allocations).to.include(contractAddress_1);
      });
    });

    it("Mixing registrations and removals", async () => {
      const contractAddress_0 = await generateContractAddress(deployer);
      const contractAddress_1 = await generateContractAddress(deployer);
      const contractAddress_2 = await generateContractAddress(deployer);
      const contractAddress_3 = await generateContractAddress(deployer);

      // always starts with one allocation, the ERC20 allocation
      let allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(1);
      expect(allocations).to.include(erc20Allocation.address);

      // register and remove
      await tvlManager
        .connect(lpSafe)
        .registerAssetAllocation(contractAddress_0);

      allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(2);
      expect(allocations).to.include(erc20Allocation.address);
      expect(allocations).to.include(contractAddress_0);

      await tvlManager.connect(lpSafe).removeAssetAllocation(contractAddress_0);

      allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(1);
      expect(allocations).to.include(erc20Allocation.address);

      // register multiple
      await tvlManager
        .connect(lpSafe)
        .registerAssetAllocation(contractAddress_0);
      await tvlManager
        .connect(lpSafe)
        .registerAssetAllocation(contractAddress_1);
      await tvlManager
        .connect(lpSafe)
        .registerAssetAllocation(contractAddress_2);

      allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(4);
      expect(allocations).to.include(erc20Allocation.address);
      expect(allocations).to.include(contractAddress_0);
      expect(allocations).to.include(contractAddress_1);
      expect(allocations).to.include(contractAddress_2);

      // remove multiple and register one
      await tvlManager.connect(lpSafe).removeAssetAllocation(contractAddress_0);
      await tvlManager.connect(lpSafe).removeAssetAllocation(contractAddress_2);
      await tvlManager
        .connect(lpSafe)
        .registerAssetAllocation(contractAddress_3);

      allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(3);
      expect(allocations).to.include(erc20Allocation.address);
      expect(allocations).to.include(contractAddress_1);
      expect(allocations).to.include(contractAddress_3);
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

    describe("_getAssetAllocationIds", () => {
      let allocation_0;
      let allocation_1;

      it("Gets correct list of IDs", async () => {
        allocation_0 = await deployMockContract(
          deployer,
          artifacts.readArtifactSync("IAssetAllocation").abi
        );
        await allocation_0.mock.numberOfTokens.returns(1);

        allocation_1 = await deployMockContract(
          deployer,
          artifacts.readArtifactSync("IAssetAllocation").abi
        );
        await allocation_1.mock.numberOfTokens.returns(2);

        const allocations = [allocation_0.address, allocation_1.address];
        const result = await tvlManager.testGetAssetAllocationIds(allocations);

        const expectedResult = [];
        expectedResult[0] = await tvlManager.testEncodeAssetAllocationId(
          allocation_0.address,
          0
        );
        expectedResult[1] = await tvlManager.testEncodeAssetAllocationId(
          allocation_1.address,
          0
        );
        expectedResult[2] = await tvlManager.testEncodeAssetAllocationId(
          allocation_1.address,
          1
        );
        expect(result).to.deep.equal(expectedResult);
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
