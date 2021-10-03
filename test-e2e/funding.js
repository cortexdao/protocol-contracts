const { expect } = require("chai");
const timeMachine = require("ganache-time-traveler");
const { deploy } = require("../scripts/deploy/deployer.js");

/****************************/
/* set DEBUG log level here */
/****************************/
console.debugging = false;
/****************************/

describe("Funding scenarios", () => {
  let lpSafe;
  let adminSafe;
  let emergencySafe;

  let addressRegistry;
  let metaPoolToken;
  let tvlManager;
  let oracleAdapter;
  let lpAccount;

  let daiPool;
  let usdcPool;
  let usdtPool;

  // use EVM snapshots for test isolation
  let suiteSnapshotId;

  before(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    suiteSnapshotId = snapshot["result"];
  });

  after(async () => {
    await timeMachine.revertToSnapshot(suiteSnapshotId);
  });

  before("Get signers", async () => {
    [deployer, randomUser] = await ethers.getSigners();
  });

  before("Deploy platform", async () => {
    ({
      lpSafe,
      adminSafe,
      emergencySafe,
      addressRegistry,
      metaPoolToken,
      daiPool,
      usdcPool,
      usdtPool,
      tvlManager,
      oracleAdapter,
      lpAccount,
    } = await deploy());
  });
});
