const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");

describe("Contract: TestAaveZap", () => {
  // signers
  let deployer;

  // deployed contracts
  let aaveZap;
  let underlyer;
  let lendingPool;

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
    [deployer] = await ethers.getSigners();

    lendingPool = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("ILendingPool").abi
    );

    underlyer = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IDetailedERC20").abi
    );

    await underlyer.mock.allowance.returns(0);
    await underlyer.mock.approve.returns(true);

    const TestAaveZap = await ethers.getContractFactory("TestAaveZap");
    aaveZap = await TestAaveZap.deploy(underlyer.address, lendingPool.address);
  });

  describe("Constructor", () => {
    it("Test Inherited Contract Variables are set corretly", async () => {
      const name = await aaveZap.NAME();
      const underlyerAddress = await aaveZap.getUnderlyerAddress();
      const lendingPoolAddress = await aaveZap.getLendingAddress();

      expect(name).to.equals("aave-test");
      expect(underlyerAddress).to.equals(underlyer.address);
      expect(lendingPoolAddress).to.equals(lendingPool.address);
    });
  });

  describe("deployLiquidity", () => {
    it("does not revert with the correct number of amounts", async () => {
      const amounts = [1];
      await expect(aaveZap.deployLiquidity(amounts)).to.not.be.reverted;
    });

    it("reverts with an incorrect number of amounts", async () => {
      const amounts = [1, 2, 3];
      await expect(aaveZap.deployLiquidity(amounts)).to.be.revertedWith(
        "INVALID_AMOUNTS"
      );
    });
  });

  describe("unwindLiquidity", () => {
    it("does not revert with a correct token index", async () => {
      const amount = 1;
      const index = 0;
      await expect(aaveZap.unwindLiquidity(amount, index)).to.not.be.reverted;
    });

    it("reverts with an incorrect token index", async () => {
      const amount = 1;
      const index = 1;
      await expect(aaveZap.unwindLiquidity(amount, index)).to.be.revertedWith(
        "INVALID_INDEX"
      );
    });
  });
});
