const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS, bytes32 } = require("../utils/helpers");

describe("Contract: TvlManager", () => {
  // signers
  let deployer;
  let addressRegistry;
  let poolManager;
  let lpSafe;
  let emergencySafe;
  let oracleAdapter;
  let randomUser;

  // contract factories
  let TvlManager;

  // deployed contracts
  let tvlManager;

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
    ] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );

    oracleAdapter = await deployMockContract(
      deployer,
      artifacts.require("IOracleAdapter").abi
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

    TvlManager = await ethers.getContractFactory("TestTvlManager");

    tvlManager = await TvlManager.deploy(addressRegistry.address);
    await tvlManager.deployed();
  });

  describe("Asset allocation IDs", async () => {
    describe("encodeAssetAllocationId", async () => {
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

    describe("decodeAssetAllocationId", async () => {
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
  });
});
