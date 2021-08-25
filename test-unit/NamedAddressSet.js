const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { bytes32 } = require("../utils/helpers");
const { deployMockContract } = waffle;

const IAssetAllocation = artifacts.readArtifactSync("IAssetAllocation");
const IZap = artifacts.readArtifactSync("IZap");

async function getMockAllocation(name) {
  const [deployer] = await ethers.getSigners();
  const allocation = await deployMockContract(deployer, IAssetAllocation.abi);
  await allocation.mock.NAME.returns(name || "mock allocation");
  return allocation;
}

async function getMockZap(name) {
  const [deployer] = await ethers.getSigners();
  const zap = await deployMockContract(deployer, IZap.abi);
  await zap.mock.NAME.returns(name || "mock zap");
  return zap;
}

describe("Library: NamedAddressSet", () => {
  let namedZapSet;

  // use EVM snapshots for test isolation
  let snapshotId;

  let tokenMock_0;
  let tokenMock_1;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  describe("NamedAllocationSet", () => {
    let namedAllocationSet;

    before(async () => {
      const TestNamedAssetAllocationSet = await ethers.getContractFactory(
        "TestNamedAssetAllocationSet"
      );
      namedAllocationSet = await TestNamedAssetAllocationSet.deploy();
    });

    it.only("Can add single allocation", async () => {
      const allocation = await getMockAllocation();
      const name = await allocation.NAME();
      await namedAllocationSet.add(allocation.address);

      expect(await namedAllocationSet.length()).to.equal(1);
      expect(await namedAllocationSet.names()).to.deep.equal([name]);
      expect(await namedAllocationSet.contains(allocation.address)).to.be.true;
      expect(await namedAllocationSet.get(name)).to.equal(allocation.address);
      expect(await namedAllocationSet.at(0)).to.equal(allocation.address);
    });

    it.only("Revert on adding duplicate allocation", async () => {
      const allocation = await getMockAllocation();
      await namedAllocationSet.add(allocation.address);

      await expect(
        namedAllocationSet.add(allocation.address)
      ).to.be.revertedWith("DUPLICATE_ADDRESS");
    });

    it.only("Can add multiple allocations", async () => {
      const allocation_0 = await getMockAllocation("allocation 0");
      const name_0 = await allocation_0.NAME();
      await namedAllocationSet.add(allocation_0.address);

      const allocation_1 = await getMockAllocation("allocation 1");
      const name_1 = await allocation_1.NAME();
      await namedAllocationSet.add(allocation_1.address);

      expect(await namedAllocationSet.length()).to.equal(2);
      expect(await namedAllocationSet.names()).to.deep.equal([name_0, name_1]);

      expect(await namedAllocationSet.contains(allocation_0.address)).to.be
        .true;
      expect(await namedAllocationSet.get(name_0)).to.equal(
        allocation_0.address
      );
      expect(await namedAllocationSet.at(0)).to.equal(allocation_0.address);

      expect(await namedAllocationSet.contains(allocation_1.address)).to.be
        .true;
      expect(await namedAllocationSet.get(name_1)).to.equal(
        allocation_1.address
      );
      expect(await namedAllocationSet.at(1)).to.equal(allocation_1.address);
    });

    it.only("Revert when removing non-existent allocation", async () => {
      const allocation = await getMockAllocation();
      const name = await allocation.NAME();
      await expect(namedAllocationSet.remove(name)).to.be.revertedWith(
        "INVALID_NAME"
      );
    });

    it.only("Can mix additions and removals", async () => {
      const allocation_0 = await getMockAllocation("allocation 0");
      const name_0 = await allocation_0.NAME();
      await namedAllocationSet.add(allocation_0.address);

      const allocation_1 = await getMockAllocation("allocation 1");
      const name_1 = await allocation_1.NAME();
      await namedAllocationSet.add(allocation_1.address);

      const allocation_2 = await getMockAllocation("allocation 2");
      const name_2 = await allocation_2.NAME();
      await namedAllocationSet.add(allocation_2.address);

      expect(await namedAllocationSet.length()).to.equal(3);
      expect(await namedAllocationSet.names()).to.deep.equal([
        name_0,
        name_1,
        name_2,
      ]);
    });
  });
});
