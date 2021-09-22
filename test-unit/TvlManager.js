const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  ZERO_ADDRESS,
  FAKE_ADDRESS,
  tokenAmountToBigNumber,
} = require("../utils/helpers");

const IAssetAllocation = artifacts.readArtifactSync("IAssetAllocation");
const Erc20Allocation = artifacts.readArtifactSync("Erc20Allocation");
const IAddressRegistryV2 = artifacts.readArtifactSync("IAddressRegistryV2");
const INameIdentifier = artifacts.readArtifactSync("INameIdentifier");
const ILockingOracle = artifacts.readArtifactSync("ILockingOracle");

async function generateContractAddress(signer, name) {
  const mockContract = await deployMockContract(signer, INameIdentifier.abi);
  await mockContract.mock.NAME.returns(name || "mockAllocation");
  return mockContract.address;
}

async function generateAllocationAddress(signer, name) {
  const mockContract = await deployMockContract(signer, IAssetAllocation.abi);
  await mockContract.mock.NAME.returns(name || "mockAllocation");
  return mockContract.address;
}

async function deployMockAllocation(signer, name) {
  const mockAllocation = await deployMockContract(signer, IAssetAllocation.abi);
  await mockAllocation.mock.NAME.returns(name || "mockAllocation");
  return mockAllocation;
}

describe("Contract: TvlManager", () => {
  // signers
  let deployer;
  let adminSafe;
  let emergencySafe;
  let lpAccount;
  let randomUser;

  // contract factories
  let TvlManager;

  // deployed contracts
  let tvlManager;
  // mocks
  let addressRegistry;
  let erc20Allocation;
  let oracleAdapter;

  const mockSymbol = "MOCK";

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
      adminSafe,
      emergencySafe,
      lpAccount,
      randomUser,
    ] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      IAddressRegistryV2.abi
    );

    oracleAdapter = await deployMockContract(deployer, ILockingOracle.abi);
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );
    await oracleAdapter.mock.lock.returns();

    await addressRegistry.mock.lpAccountAddress.returns(lpAccount.address);

    // These registered addresses are setup for roles in the
    // constructor for TvlManager
    await addressRegistry.mock.adminSafeAddress.returns(adminSafe.address);
    await addressRegistry.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );

    TvlManager = await ethers.getContractFactory("TestTvlManager");
    tvlManager = await TvlManager.deploy(addressRegistry.address);

    erc20Allocation = await deployMockContract(deployer, Erc20Allocation.abi);
    const erc20AllocationName = await tvlManager.NAME();
    await erc20Allocation.mock.NAME.returns(erc20AllocationName);
    await erc20Allocation.mock.numberOfTokens.returns(1);
    await erc20Allocation.mock.symbolOf.withArgs(0).returns(mockSymbol);
  });

  describe("Constructor", () => {
    it("Reverts on non-contract address for address registry", async () => {
      await expect(TvlManager.deploy(FAKE_ADDRESS)).to.be.revertedWith(
        "INVALID_ADDRESS"
      );
    });
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

    it("Admin role given to Admin Safe", async () => {
      const ADMIN_ROLE = await tvlManager.ADMIN_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(ADMIN_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(ADMIN_ROLE, adminSafe.address)).to.be
        .true;
    });

    it("addressRegistry was set", async () => {
      expect(await tvlManager.addressRegistry()).to.equal(
        addressRegistry.address
      );
    });
  });

  describe("emergencySetAddressRegistry", () => {
    it("Emergency Safe can call", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await expect(
        tvlManager
          .connect(emergencySafe)
          .emergencySetAddressRegistry(someContractAddress)
      ).to.not.be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await expect(
        tvlManager
          .connect(randomUser)
          .emergencySetAddressRegistry(someContractAddress)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Address can be set", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await tvlManager
        .connect(emergencySafe)
        .emergencySetAddressRegistry(someContractAddress);
      expect(await tvlManager.addressRegistry()).to.equal(someContractAddress);
    });

    it("Cannot set to non-contract address", async () => {
      await expect(
        tvlManager
          .connect(emergencySafe)
          .emergencySetAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });
  });

  describe("Adding and removing asset allocations", () => {
    describe("registerAssetAllocation", () => {
      it("LP Safe can call", async () => {
        const allocationAddress = await generateAllocationAddress(deployer);
        await expect(
          tvlManager
            .connect(adminSafe)
            .registerAssetAllocation(allocationAddress)
        ).to.not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        const allocationAddress = await generateAllocationAddress(deployer);
        await expect(
          tvlManager
            .connect(randomUser)
            .registerAssetAllocation(allocationAddress)
        ).to.be.revertedWith("NOT_ADMIN_ROLE");
      });

      it("Cannot register non-contract address", async () => {
        await expect(
          tvlManager.connect(adminSafe).registerAssetAllocation(FAKE_ADDRESS)
        ).to.be.revertedWith("INVALID_ADDRESS");
      });

      it("Correctly populates array of allocations", async () => {
        let allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(0);

        const allocation_0 = await deployMockAllocation(
          deployer,
          "allocation 0"
        );
        const contractAddress_0 = allocation_0.address;
        const allocation_1 = await deployMockAllocation(
          deployer,
          "allocation 1"
        );
        const contractAddress_1 = allocation_1.address;

        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(contractAddress_0);
        allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(1);
        expect(allocations).to.include(contractAddress_0);

        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(contractAddress_1);
        allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(2);
        expect(allocations).to.include(contractAddress_0);
        expect(allocations).to.include(contractAddress_1);

        // check no duplicates can be registered
        await expect(
          tvlManager
            .connect(adminSafe)
            .registerAssetAllocation(contractAddress_0)
        ).to.be.revertedWith("DUPLICATE_ADDRESS");
      });
    });

    describe("removeAssetAllocation", () => {
      it("LP Safe can call", async () => {
        const allocation = await deployMockAllocation(deployer);
        const name = await allocation.NAME();
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(allocation.address);
        await expect(tvlManager.connect(adminSafe).removeAssetAllocation(name))
          .to.not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        const allocation = await deployMockAllocation(deployer);
        const name = await allocation.NAME();
        await expect(
          tvlManager.connect(randomUser).removeAssetAllocation(name)
        ).to.be.revertedWith("NOT_ADMIN_ROLE");
      });

      it("Cannot remove ERC20 allocation", async () => {
        const erc20AllocationName = await tvlManager.NAME();
        await expect(
          tvlManager
            .connect(adminSafe)
            .removeAssetAllocation(erc20AllocationName)
        ).to.be.revertedWith("CANNOT_REMOVE_ALLOCATION");
      });

      it("Correctly removes allocation", async () => {
        const allocation_0 = await deployMockAllocation(
          deployer,
          "allocation 0"
        );
        const name_0 = await allocation_0.NAME();
        const contractAddress_0 = allocation_0.address;
        const allocation_1 = await deployMockAllocation(
          deployer,
          "allocation 1"
        );
        const contractAddress_1 = allocation_1.address;

        // setup and assert preconditions
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(contractAddress_0);
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(contractAddress_1);

        let allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(2);
        expect(allocations).to.include(contractAddress_0);
        expect(allocations).to.include(contractAddress_1);

        // start test
        await tvlManager.connect(adminSafe).removeAssetAllocation(name_0);

        allocations = await tvlManager.testGetAssetAllocations();
        expect(allocations).to.have.lengthOf(1);
        expect(allocations).to.include(contractAddress_1);
      });
    });

    it("Mixing registrations and removals", async () => {
      const name_0 = "allocation 0";
      const contractAddress_0 = await generateAllocationAddress(
        deployer,
        name_0
      );
      const contractAddress_1 = await generateAllocationAddress(
        deployer,
        "allocation 1"
      );
      const name_2 = "allocation 2";
      const contractAddress_2 = await generateAllocationAddress(
        deployer,
        name_2
      );
      const contractAddress_3 = await generateAllocationAddress(
        deployer,
        "allocation 3"
      );

      // always starts with one allocation, the ERC20 allocation
      let allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(0);

      // register and remove
      await tvlManager
        .connect(adminSafe)
        .registerAssetAllocation(contractAddress_0);

      allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(1);
      expect(allocations).to.include(contractAddress_0);

      await tvlManager.connect(adminSafe).removeAssetAllocation(name_0);

      allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(0);

      // register multiple
      await tvlManager
        .connect(adminSafe)
        .registerAssetAllocation(contractAddress_0);
      await tvlManager
        .connect(adminSafe)
        .registerAssetAllocation(contractAddress_1);
      await tvlManager
        .connect(adminSafe)
        .registerAssetAllocation(contractAddress_2);

      allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(3);
      expect(allocations).to.include(contractAddress_0);
      expect(allocations).to.include(contractAddress_1);
      expect(allocations).to.include(contractAddress_2);

      // remove multiple and register one
      await tvlManager.connect(adminSafe).removeAssetAllocation(name_0);
      await tvlManager.connect(adminSafe).removeAssetAllocation(name_2);
      await tvlManager
        .connect(adminSafe)
        .registerAssetAllocation(contractAddress_3);

      allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(2);
      expect(allocations).to.include(contractAddress_1);
      expect(allocations).to.include(contractAddress_3);
    });
  });

  describe("Asset allocation IDs", () => {
    describe("_encodeAssetAllocationId", () => {
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

    describe("_decodeAssetAllocationId", () => {
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
        allocation_0 = await deployMockAllocation(deployer, "allocation 0");
        await allocation_0.mock.numberOfTokens.returns(1);

        allocation_1 = await deployMockAllocation(deployer, "allocation 1");
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

    describe("getAssetAllocationIds", async () => {
      const allocations = [];
      const numTokens = [4, 2, 2];

      it("Gets correct list of IDs", async () => {
        expect(await tvlManager.getAssetAllocationIds()).to.be.empty;

        for (let i = 0; i < numTokens.length; i++) {
          const allocation = await deployMockAllocation(
            deployer,
            `allocation ${i}`
          );
          allocation.mock.numberOfTokens.returns(numTokens[i]);
          await tvlManager
            .connect(adminSafe)
            .registerAssetAllocation(allocation.address);
          allocations.push(allocation);
        }

        const expectedResult = [];
        for (let i = 0; i < allocations.length; i++) {
          const allocationAddress = allocations[i].address;
          for (let j = 0; j < numTokens[i]; j++) {
            const id = await tvlManager.testEncodeAssetAllocationId(
              allocationAddress,
              j
            );
            expectedResult.push(id);
          }
        }
        const result = await tvlManager.getAssetAllocationIds();
        expect(result).to.deep.equal(expectedResult);
      });
    });

    describe("getAssetAllocation", async () => {
      it("Returns zero address for unregistered name", async () => {
        const allocation = await deployMockAllocation(deployer);
        const name = await allocation.NAME();

        const result = await tvlManager.getAssetAllocation(name);
        expect(result).to.deep.equal(ZERO_ADDRESS);
      });

      it("Returns registered address for registered name", async () => {
        const allocation = await deployMockAllocation(deployer);
        const name = await allocation.NAME();
        await tvlManager
          .connect(adminSafe)
          .registerAssetAllocation(allocation.address);

        const result = await tvlManager.getAssetAllocation(name);
        expect(result).to.deep.equal(allocation.address);
      });
    });

    describe("_getAssetAllocationIdCount", async () => {
      it("should return zero when given an empty array", async () => {
        const assetAllocations = [];
        const length = assetAllocations.length;

        const result = await tvlManager.testGetAssetAllocationIdCount(
          assetAllocations
        );

        expect(result).to.equal(length);
      });

      it("should loop through all the asset allocations and get the length", async () => {
        const length = 3;
        const assetAllocations = await Promise.all(
          [...new Array(length)].map(async () => {
            const allocation = await deployMockContract(
              deployer,
              IAssetAllocation.abi
            );

            await allocation.mock.numberOfTokens.returns(1);

            return allocation.address;
          })
        );

        const result = await tvlManager.testGetAssetAllocationIdCount(
          assetAllocations
        );

        expect(result).to.equal(length);
      });

      it("should handle multiple allocations with different numbers of tokens", async () => {
        const length = 3;
        const assetAllocations = await Promise.all(
          [...new Array(length)].map(async (_, index) => {
            const allocation = await deployMockContract(
              deployer,
              IAssetAllocation.abi
            );

            await allocation.mock.numberOfTokens.returns(index + 1);

            return allocation.address;
          })
        );

        const result = await tvlManager.testGetAssetAllocationIdCount(
          assetAllocations
        );

        const totalLength = 6;
        expect(result).to.equal(totalLength);
      });
    });
  });

  describe("Allocation view functions", () => {
    const token_0 = {
      symbol: "TOKEN0",
      decimals: 6,
    };
    const token_1 = {
      symbol: "TOKEN1",
      decimals: 8,
    };
    let allocation;
    let allocationId_0;
    let allocationId_1;

    beforeEach("Setup allocation and IDs", async () => {
      allocation = await deployMockAllocation(deployer);
      await allocation.mock.numberOfTokens.returns(2);

      await tvlManager
        .connect(adminSafe)
        .registerAssetAllocation(allocation.address);

      allocationId_0 = await tvlManager.testEncodeAssetAllocationId(
        allocation.address,
        0
      );
      allocationId_1 = await tvlManager.testEncodeAssetAllocationId(
        allocation.address,
        1
      );
    });

    it("symbolOf", async () => {
      await allocation.mock.symbolOf.withArgs(0).returns(token_0.symbol);
      expect(await tvlManager.symbolOf(allocationId_0)).to.equal(
        token_0.symbol
      );

      await allocation.mock.symbolOf.withArgs(1).returns(token_1.symbol);
      expect(await tvlManager.symbolOf(allocationId_1)).to.equal(
        token_1.symbol
      );
    });

    it("decimalsOf", async () => {
      await allocation.mock.decimalsOf.withArgs(0).returns(token_0.decimals);
      expect(await tvlManager.decimalsOf(allocationId_0)).to.equal(
        token_0.decimals
      );

      await allocation.mock.decimalsOf.withArgs(1).returns(token_1.decimals);
      expect(await tvlManager.decimalsOf(allocationId_1)).to.equal(
        token_1.decimals
      );
    });

    it("balanceOf", async () => {
      const balance_0 = tokenAmountToBigNumber("100");
      await allocation.mock.balanceOf
        .withArgs(lpAccount.address, 0)
        .returns(balance_0);
      expect(await tvlManager.balanceOf(allocationId_0)).to.equal(balance_0);

      const balance_1 = tokenAmountToBigNumber("250");
      await allocation.mock.balanceOf
        .withArgs(lpAccount.address, 1)
        .returns(balance_1);
      expect(await tvlManager.balanceOf(allocationId_1)).to.equal(balance_1);
    });
  });
});
