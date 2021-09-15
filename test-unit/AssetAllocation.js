const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const { FAKE_ADDRESS } = require("../utils/helpers");

describe("Contract: AssetAllocation", () => {
  // contract factories
  let ImmutableAssetAllocation;

  // deployed contracts
  let allocation;

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
    ImmutableAssetAllocation = await ethers.getContractFactory(
      "TestImmutableAssetAllocation"
    );
    allocation = await ImmutableAssetAllocation.deploy();
  });

  describe("Constructor", () => {
    it("Constructor populates tokens correctly", async () => {
      const result = await allocation.tokens();
      const expectedTokens = await allocation.testGetTokenData();
      // have to check in this cumbersome manner rather than a deep
      // equal, because Ethers returns each struct as an *array*
      // with struct fields set as properties
      expect(result[0].token).to.equal(expectedTokens[0].token);
      expect(result[0].symbol).to.equal(expectedTokens[0].symbol);
      expect(result[0].decimals).to.equal(expectedTokens[0].decimals);
      expect(result[1].token).to.equal(expectedTokens[1].token);
      expect(result[1].symbol).to.equal(expectedTokens[1].symbol);
      expect(result[1].decimals).to.equal(expectedTokens[1].decimals);
    });
  });

  describe("View functions read token info correctly", () => {
    let tokens;

    before(async () => {
      tokens = await allocation.tokens();
    });

    it("symbolOf", async () => {
      expect(await allocation.symbolOf(0)).to.equal(tokens[0].symbol);
      expect(await allocation.symbolOf(1)).to.equal(tokens[1].symbol);
    });

    it("decimalsOf", async () => {
      expect(await allocation.decimalsOf(0)).to.equal(tokens[0].decimals);
      expect(await allocation.decimalsOf(1)).to.equal(tokens[1].decimals);
    });

    it("balanceOf", async () => {
      expect(await allocation.balanceOf(FAKE_ADDRESS, 0)).to.equal(42);
    });
  });
});
