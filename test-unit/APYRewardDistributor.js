const { ethers, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder } = ethers.utils;
const {
  BN,
  constants,
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const MockContract = artifacts.require("MockContract");
const ERC20 = new ethers.utils.Interface(artifacts.require("ERC20").abi);
const RewardDistributor = artifacts.require("APYRewardDistributor");

contract("APYRewardDistributor Unit Test", async (accounts) => {
  const [owner, instanceAdmin, randomUser, randomAddress] = accounts;

  let rewardDistributor;
  let mockToken;
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    mockToken = await MockContract.new();
    rewardDistributor = await APYRewardDistributor.at();
  });

  describe("Test Constructor", async () => {
    it("Test APY Contract set", async () => {
      //test APY is set
      //test APY cannot be changed
    })

    it("Test Signer set", async () => {
    })

    it("Test Owner is set", async () => {
    })
  })

  describe("Test Claiming", async () => {
    it("Test Signature mismatch", async () => {
    });

    it("Test claiming nonce < user nonce", async () => {
    });

    it("Test claiming nonce > user nonce", async () => {
    });

    it("Test claiming more than available balance of contract", async () => {
    });

    it("Test claiming for another user", async () => {
    });

    it("Test all funds can be removed from contract", async () => {
    });
  });
});
