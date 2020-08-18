const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const {
  BN,
  ether,
  balance,
  send,
  constants,
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");

const APYStrategy = artifacts.require("TestStrategy");

const ZERO_ADDRESS = constants.ZERO_ADDRESS;
const DUMMY_ADDRESS = "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE";
const DUMMY_ADDRESS_2 = "0xBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEFBEEF";
const DUMMY_ADDRESS_3 = "0xDEADDEADDEADDEADDEADDEADDEADDEADDEADDEAD";

contract("APYStrategy", async (accounts) => {
  const [deployer, wallet, other] = accounts;
  let strategy;

  beforeEach(async () => {
    strategy = await APYStrategy.new([ZERO_ADDRESS], ["100"]);
  });

  it("should be able to get name", async () => {
    expect(await strategy.name()).to.equal("TestStrategy");
  });

  it("should be able to get input assets", async () => {
    const inputAssets = await strategy.inputAssets();
    result = inputAssets[0];
    expect(result.token).to.equal(ZERO_ADDRESS);
    expect(result.proportion).to.equal("100");
  });

  it("_setInputAssets should succeed with good data", async () => {
    try {
      await APYStrategy.new([DUMMY_ADDRESS], ["100"]);
      await APYStrategy.new([DUMMY_ADDRESS, DUMMY_ADDRESS], ["5", "95"]);
      await APYStrategy.new(
        [DUMMY_ADDRESS, DUMMY_ADDRESS, DUMMY_ADDRESS],
        ["1", "4", "95"]
      );
    } catch {
      assert.fail("Could not deploy strategy with valid init data.");
    }
  });

  it("_setInputAssets should fail with bad data", async () => {
    await expectRevert(
      APYStrategy.new([DUMMY_ADDRESS], ["5"]),
      "Strategy/invalid-proportion"
    );
    await expectRevert(
      APYStrategy.new([DUMMY_ADDRESS], ["101"]),
      "Strategy/invalid-proportion"
    );
    await expectRevert(
      APYStrategy.new([DUMMY_ADDRESS], ["5", "95"]),
      "Strategy/invalid-data-length"
    );
    await expectRevert(
      APYStrategy.new(
        [DUMMY_ADDRESS, DUMMY_ADDRESS, DUMMY_ADDRESS],
        ["-1", "6", "95"]
      ),
      "Strategy/invalid-proportion"
    );
  });
});
