const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("../utils/helpers");
const { deployMockContract } = waffle;
const _ = require("lodash");

const IAssetAllocation = artifacts.readArtifactSync("IAssetAllocation");
const IZap = artifacts.readArtifactSync("IZap");

describe("Library: NamedAddressSet", () => {
  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  const SuiteParams = [
    {
      name: "NamedAllocationSet",
      contract: "TestNamedAssetAllocationSet",
      getMockItem: getMockAllocation,
    },
    {
      name: "NamedZapSet",
      contract: "TestNamedZapSet",
      getMockItem: getMockZap,
    },
  ];

  SuiteParams.forEach(function (params) {
    const { name, contract, getMockItem } = params;

    describe(`${name}`, () => {
      let namedSet;

      before(async () => {
        const TestNamedSet = await ethers.getContractFactory(contract);
        namedSet = await TestNamedSet.deploy();
      });

      it("Can add single item", async () => {
        const item = await getMockItem();
        await namedSet.add(item.address);

        await validateMembership(namedSet, [item], [true]);
      });

      it("Revert on adding duplicate address", async () => {
        const item = await getMockItem();
        await namedSet.add(item.address);

        await expect(namedSet.add(item.address)).to.be.revertedWith(
          "DUPLICATE_ADDRESS"
        );
      });

      it("Revert on adding duplicate name", async () => {
        const item = await getMockItem("foo");
        await namedSet.add(item.address);
        const anotherItem = await getMockItem("foo");

        expect(anotherItem.address).to.not.equal(item.address);
        await expect(namedSet.add(anotherItem.address)).to.be.revertedWith(
          "DUPLICATE_NAME"
        );
      });

      it("Revert on adding null name", async () => {
        const item = await getMockItem();
        await item.mock.NAME.returns("");

        await expect(namedSet.add(item.address)).to.be.revertedWith(
          "INVALID_NAME"
        );
      });

      it("Can add multiple items", async () => {
        const item_0 = await getMockItem("item 0");
        await namedSet.add(item_0.address);

        const item_1 = await getMockItem("item 1");
        await namedSet.add(item_1.address);

        await validateMembership(namedSet, [item_0, item_1], [true, true]);
      });

      it("Revert when removing non-existent item", async () => {
        const item = await getMockItem();
        const name = await item.NAME();
        await expect(namedSet.remove(name)).to.be.revertedWith("INVALID_NAME");
      });

      it("Can mix additions and removals", async () => {
        const item_0 = await getMockItem("item 0");
        const name_0 = await item_0.NAME();
        await namedSet.add(item_0.address);

        const item_1 = await getMockItem("item 1");
        const name_1 = await item_1.NAME();
        await namedSet.add(item_1.address);

        const item_2 = await getMockItem("item 2");
        const name_2 = await item_2.NAME();
        await namedSet.add(item_2.address);

        const all_items = [item_0, item_1, item_2];

        const isContainedArray = [true, true, true];
        await validateMembership(namedSet, all_items, isContainedArray);

        await namedSet.remove(name_1);
        isContainedArray[1] = false;
        await validateMembership(namedSet, all_items, isContainedArray);

        await namedSet.remove(name_0);
        isContainedArray[0] = false;
        await validateMembership(namedSet, all_items, isContainedArray);

        await namedSet.add(item_0.address);
        isContainedArray[0] = true;
        await validateMembership(namedSet, all_items, isContainedArray);

        await namedSet.remove(name_2);
        isContainedArray[2] = false;
        await validateMembership(namedSet, all_items, isContainedArray);

        await namedSet.add(item_1.address);
        isContainedArray[1] = true;
        await validateMembership(namedSet, all_items, isContainedArray);
      });
    });
  });

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

  /*
   * Test helper to assert/expect all the precise conditions for an item to be
   * in the named set.  This makes sure we don't miss one particular way of checking
   * membership, as there are multiple ways.
   *
   * @param namedSet: NamedAddressSet
   * @param isContainedArray: array of bools, indicating expected membership in set
   * @param items: array of items that isContainedArray refers to
   */
  async function validateMembership(namedSet, items, isContainedArray) {
    const numContained = isContainedArray.filter(Boolean).length;
    expect(await namedSet.length()).to.equal(numContained);

    const expectedNames = [];
    const expectedAddresses = [];
    for (const [item, isContained] of _.zip(items, isContainedArray)) {
      const name = await item.NAME();
      if (isContained) {
        expect(await namedSet.contains(item.address)).to.be.true;
        expect(await namedSet.get(name)).to.equal(item.address);
        expectedNames.push(name);
        expectedAddresses.push(item.address);
      } else {
        expect(await namedSet.contains(item.address)).to.be.false;
        expect(await namedSet.get(name)).to.equal(ZERO_ADDRESS);
      }
    }

    const namesResult = await namedSet.names();
    expect(namesResult.length).to.equal(expectedNames.length);
    expect(namesResult).to.have.members(expectedNames);

    for (let i = 0; i < numContained; i++) {
      const itemAddress = await namedSet.at(i);
      const item = await ethers.getContractAt("INameIdentifier", itemAddress);
      const name = await item.NAME();
      expect(expectedNames).to.include(name);
      const idx = expectedNames.findIndex((x) => x === name);
      expect(expectedAddresses[idx]).to.equal(itemAddress);
    }
  }
});
