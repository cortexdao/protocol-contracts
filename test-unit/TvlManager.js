const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  ZERO_ADDRESS,
  FAKE_ADDRESS,
  bytes32,
  tokenAmountToBigNumber,
} = require("../utils/helpers");

const IAssetAllocation = artifacts.readArtifactSync("IAssetAllocation");
const Erc20Allocation = artifacts.readArtifactSync("Erc20Allocation");
const IAddressRegistryV2 = artifacts.readArtifactSync("IAddressRegistryV2");
const IOracleAdapter = artifacts.readArtifactSync("IOracleAdapter");

async function generateContractAddress(signer) {
  const mockContract = await deployMockContract(signer, []);
  return mockContract.address;
}

describe("Contract: TvlManager", () => {
  // signers
  let deployer;
  let lpSafe;
  let emergencySafe;
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
    [deployer, lpSafe, emergencySafe, randomUser] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      IAddressRegistryV2.abi
    );

    oracleAdapter = await deployMockContract(deployer, IOracleAdapter.abi);
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );
    await oracleAdapter.mock.lock.returns();

    // These registered addresses are setup for roles in the
    // constructor for TvlManager
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    erc20Allocation = await deployMockContract(deployer, Erc20Allocation.abi);
    await erc20Allocation.mock.numberOfTokens.returns(1);
    await erc20Allocation.mock.symbolOf.withArgs(0).returns(mockSymbol);

    TvlManager = await ethers.getContractFactory("TestTvlManager");
    tvlManager = await TvlManager.deploy(
      addressRegistry.address,
      erc20Allocation.address
    );
    await tvlManager.deployed();
  });

  describe("Constructor", () => {
    it("Reverts on non-contract address for address registry", async () => {
      await expect(
        TvlManager.deploy(FAKE_ADDRESS, erc20Allocation.address)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });

    it("Reverts on non-contract address for ERC20 allocation", async () => {
      await expect(
        TvlManager.deploy(addressRegistry.address, FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
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

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await tvlManager.LP_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });

    it("addressRegistry was set", async () => {
      expect(await tvlManager.addressRegistry()).to.equal(
        addressRegistry.address
      );
    });

    it("erc20Allocation was set", async () => {
      expect(await tvlManager.erc20Allocation()).to.equal(
        erc20Allocation.address
      );
    });

    it("ERC20 allocation was registered", async () => {
      const allocations = await tvlManager.testGetAssetAllocations();
      expect(allocations).to.have.lengthOf(1);
      expect(allocations).to.include(erc20Allocation.address);
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

  describe("emergencySetErc20Allocation", () => {
    it("Emergency Safe can call", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await expect(
        tvlManager
          .connect(emergencySafe)
          .emergencySetErc20Allocation(someContractAddress)
      ).to.not.be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await expect(
        tvlManager
          .connect(randomUser)
          .emergencySetErc20Allocation(someContractAddress)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Address can be set", async () => {
      const someContractAddress = await generateContractAddress(deployer);
      await tvlManager
        .connect(emergencySafe)
        .emergencySetErc20Allocation(someContractAddress);
      expect(await tvlManager.erc20Allocation()).to.equal(someContractAddress);
    });

    it("Cannot set to non-contract address", async () => {
      await expect(
        tvlManager
          .connect(emergencySafe)
          .emergencySetErc20Allocation(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });
  });

  describe("Adding and removing asset allocations", () => {
    describe("registerAssetAllocation", () => {
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
        ).to.be.revertedWith("NOT_LP_OR_CONTRACT_ROLE");
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
        const contractAddress = await generateContractAddress(deployer);
        await expect(
          tvlManager.connect(lpSafe).removeAssetAllocation(contractAddress)
        ).to.not.be.reverted;
      });

      it("LP Safe can call", async () => {
        const contractAddress = await generateContractAddress(deployer);
        await expect(
          tvlManager.connect(lpSafe).removeAssetAllocation(contractAddress)
        ).to.not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        const contractAddress = await generateContractAddress(deployer);
        await expect(
          tvlManager
            .connect(randomUser)
            .registerAssetAllocation(contractAddress)
        ).to.be.revertedWith("NOT_LP_OR_CONTRACT_ROLE");
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

    describe("encodeAssetAllocationId", async () => {
      let allocation;
      let numTokens = 4;

      beforeEach("register asset allocations", async () => {
        allocation = await deployMockContract(deployer, Erc20Allocation.abi);
        await allocation.mock.numberOfTokens.returns(numTokens);

        await tvlManager
          .connect(lpSafe)
          .registerAssetAllocation(allocation.address);
      });

      it("should fail on unregistered address", async () => {
        const unregisteredAddress = await generateContractAddress(deployer);
        await expect(
          tvlManager.encodeAssetAllocationId(unregisteredAddress, 0)
        ).to.be.revertedWith("INVALID_ASSET_ALLOCATION");
      });

      it("should fail with invalid token index", async () => {
        await expect(
          tvlManager.encodeAssetAllocationId(allocation.address, numTokens)
        ).to.be.revertedWith("INVALID_TOKEN_INDEX");
      });

      it("Successfully get ID for registered allocation and valid index", async () => {
        for (let i = 0; i < numTokens; i++) {
          await expect(
            tvlManager.encodeAssetAllocationId(allocation.address, i)
          ).to.not.be.reverted;
        }
      });
    });

    describe("_getAssetAllocationIds", () => {
      let allocation_0;
      let allocation_1;

      it("Gets correct list of IDs", async () => {
        allocation_0 = await deployMockContract(deployer, IAssetAllocation.abi);
        await allocation_0.mock.numberOfTokens.returns(1);

        allocation_1 = await deployMockContract(deployer, IAssetAllocation.abi);
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
        const erc20Id = await tvlManager.testEncodeAssetAllocationId(
          erc20Allocation.address,
          0
        );
        expect(await tvlManager.getAssetAllocationIds()).to.deep.equal([
          erc20Id,
        ]);

        for (let i = 0; i < numTokens.length; i++) {
          const allocation = await deployMockContract(
            deployer,
            IAssetAllocation.abi
          );
          allocation.mock.numberOfTokens.returns(numTokens[i]);
          await tvlManager
            .connect(lpSafe)
            .registerAssetAllocation(allocation.address);
          allocations.push(allocation);
        }

        const expectedResult = [erc20Id];
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

    describe("decodeAssetAllocationId", async () => {
      it("should revert when an address is not registered", async () => {
        const randomAddress = await generateContractAddress(deployer);
        const id = await tvlManager.testEncodeAssetAllocationId(
          randomAddress,
          0
        );
        await expect(tvlManager.decodeAssetAllocationId(id)).to.be.revertedWith(
          "INVALID_ASSET_ALLOCATION"
        );
      });

      it("should revert when a token index does not exist for an asset allocation", async () => {
        const id = await tvlManager.testEncodeAssetAllocationId(
          erc20Allocation.address,
          99
        );
        await expect(tvlManager.decodeAssetAllocationId(id)).to.be.revertedWith(
          "INVALID_TOKEN_INDEX"
        );
      });

      it("should return the decoded ID if the asset allocation is valid", async () => {
        const id = await tvlManager.testEncodeAssetAllocationId(
          erc20Allocation.address,
          0
        );

        const result = await tvlManager.decodeAssetAllocationId(id);

        expect(result).to.deep.equal([erc20Allocation.address, 0]);
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
      allocation = await deployMockContract(deployer, IAssetAllocation.abi);
      await allocation.mock.numberOfTokens.returns(2);

      await tvlManager
        .connect(lpSafe)
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
      await allocation.mock.symbolOf.withArgs(1).returns(token_1.symbol);
      expect(await tvlManager.symbolOf(allocationId_0)).to.equal(
        token_0.symbol
      );
      expect(await tvlManager.symbolOf(allocationId_1)).to.equal(
        token_1.symbol
      );
    });

    it("decimalsOf", async () => {
      await allocation.mock.decimalsOf.withArgs(0).returns(token_0.decimals);
      await allocation.mock.decimalsOf.withArgs(1).returns(token_1.decimals);
      expect(await tvlManager.decimalsOf(allocationId_0)).to.equal(
        token_0.decimals
      );
      expect(await tvlManager.decimalsOf(allocationId_1)).to.equal(
        token_1.decimals
      );
    });

    it("balanceOf", async () => {
      const balance_0 = tokenAmountToBigNumber("100");
      const balance_1 = tokenAmountToBigNumber("250");
      await allocation.mock.balanceOf
        .withArgs(lpSafe.address, 0)
        .returns(balance_0);
      await allocation.mock.balanceOf
        .withArgs(lpSafe.address, 1)
        .returns(balance_1);
      expect(await tvlManager.balanceOf(allocationId_0)).to.equal(balance_0);
      expect(await tvlManager.balanceOf(allocationId_1)).to.equal(balance_1);
    });
  });
});
