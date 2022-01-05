const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  ZERO_ADDRESS,
  tokenAmountToBigNumber,
  FAKE_ADDRESS,
} = require("../utils/helpers");
const { BigNumber } = ethers;

describe.only("VotingEscrow deployment", () => {
  // signers
  let deployer;

  // contract factories
  let VotingEscrow;

  // deployed contracts
  let veCrv;

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
  });

  it("Can deploy VotingEscrow", async () => {
    const erc20Mock = await deployMockContract(
      deployer,
      artifacts.readArtifactSync("IDetailedERC20").abi
    );
    await erc20Mock.mock.decimals.returns(9);

    VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    veCrv = await expect(
      VotingEscrow.deploy(
        erc20Mock.address, // token
        "Boost-lock APY", // name
        "blAPY", // symbol
        "1.0.0" // version
      )
    ).to.not.be.reverted;
    expect(veCrv.address).to.not.equal(ZERO_ADDRESS);

    expect(await veCrv.symbol()).to.equal("blAPY");
    expect(await veCrv.name()).to.equal("Boost-lock APY");
    expect(await veCrv.version()).to.equal("1.0.0");
    expect(await veCrv.decimals()).to.equal(9);
  });
});

describe.only("Contract: VotingEscrow", () => {
  // signers
  let deployer;
  let user;
  let anotherUser;

  // contract factories
  let VotingEscrow;

  // deployed contracts
  let apy;
  let blApy;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("get signers", async () => {
    [deployer, user, anotherUser] = await ethers.getSigners();
  });

  before("deploy APY and transfer tokens to user", async () => {
    const GovernanceToken = await ethers.getContractFactory("GovernanceToken");
    apy = await GovernanceToken.deploy();
    await apy.initialize(deployer.address, tokenAmountToBigNumber(100e6));

    await apy.transfer(user.address, tokenAmountToBigNumber("100"));
    expect(await apy.balanceOf(user.address)).to.equal(
      tokenAmountToBigNumber("100")
    );
  });

  before("deploy Voting Escrow", async () => {
    VotingEscrow = await ethers.getContractFactory("VotingEscrow");
    blApy = await VotingEscrow.deploy(
      apy.address,
      "Boost-locked APY", // name
      "blAPY", // symbol
      "1.0.0" // version
    );
  });

  describe("Defaults", () => {
    it("Symbol", async () => {
      expect(await blApy.symbol()).to.equal("blAPY");
    });

    it("Name", async () => {
      expect(await blApy.name()).to.equal("Boost-locked APY");
    });

    it("Version", async () => {
      expect(await blApy.version()).to.equal("1.0.0");
    });

    it("Decimals", async () => {
      expect(await blApy.decimals()).to.equal(await apy.decimals());
    });

    it("Not shutdown", async () => {
      expect(await blApy.is_shutdown()).to.be.false;
    });

    it("Deployer is admin", async () => {
      expect(await blApy.admin()).to.equal(deployer.address);
    });
  });

  it("Admin can shutdown", async () => {
    await expect(blApy.connect(deployer).shutdown()).to.not.be.reverted;
    expect(await blApy.is_shutdown()).to.be.true;
  });

  it("User cannot shutdown", async () => {
    await expect(blApy.connect(user).shutdown()).to.be.revertedWith(
      "Admin only"
    );
  });

  it("Can lock APY", async () => {
    const currentTime = (await ethers.provider.getBlock()).timestamp;
    const unlockTime = BigNumber.from(currentTime + 86400 * 30 * 6); // lock for 6 months
    const lockAmount = tokenAmountToBigNumber("15");

    const apyBalance = await apy.balanceOf(user.address);

    await apy.connect(user).approve(blApy.address, lockAmount);
    await blApy.connect(user).create_lock(lockAmount, unlockTime);

    expect(await apy.balanceOf(user.address)).to.equal(
      apyBalance.sub(lockAmount)
    );

    expect(await blApy["balanceOf(address)"](user.address)).to.be.gt(
      lockAmount.mul(86400 * 29 * 6).div(86400 * 365 * 4)
    );
  });

  it("Cannot lock APY if shutdown", async () => {
    const currentTime = (await ethers.provider.getBlock()).timestamp;
    const unlockTime = BigNumber.from(currentTime + 86400 * 30 * 6); // lock for 6 months
    const lockAmount = tokenAmountToBigNumber("15");

    await blApy.connect(deployer).shutdown();

    await apy.connect(user).approve(blApy.address, lockAmount);
    await expect(
      blApy.connect(user).create_lock(lockAmount, unlockTime)
    ).to.be.revertedWith("Contract is shutdown");
  });

  it("Cannot deposit for another if shutdown", async () => {
    await blApy.connect(deployer).shutdown();

    await expect(
      blApy.connect(user).deposit_for(FAKE_ADDRESS, 100)
    ).to.be.revertedWith("Contract is shutdown");
  });

  it("Cannot increase locked amount if shutdown", async () => {
    await blApy.connect(deployer).shutdown();

    await expect(
      blApy.connect(user).increase_amount(tokenAmountToBigNumber(100))
    ).to.be.revertedWith("Contract is shutdown");
  });

  it("Cannot increase unlock time if shutdown", async () => {
    await blApy.connect(deployer).shutdown();

    await expect(
      blApy.connect(user).increase_unlock_time(86400 * 30)
    ).to.be.revertedWith("Contract is shutdown");
  });

  it("Cannot unlock if lock isn't expired", async () => {
    const currentTime = (await ethers.provider.getBlock()).timestamp;
    const unlockTime = BigNumber.from(currentTime + 86400 * 30 * 6); // lock for 6 months
    const lockAmount = tokenAmountToBigNumber("15");

    await apy.connect(user).approve(blApy.address, lockAmount);
    await blApy.connect(user).create_lock(lockAmount, unlockTime);

    await expect(blApy.connect(user).withdraw()).to.be.revertedWith(
      "The lock didn't expire"
    );
  });

  it("Can unlock with non-expired lock if shutdown", async () => {
    const currentTime = (await ethers.provider.getBlock()).timestamp;
    const unlockTime = BigNumber.from(currentTime + 86400 * 30 * 6); // lock for 6 months
    const lockAmount = tokenAmountToBigNumber("15");

    const apyBalance = await apy.balanceOf(user.address);

    await apy.connect(user).approve(blApy.address, lockAmount);
    await blApy.connect(user).create_lock(lockAmount, unlockTime);

    expect(await apy.balanceOf(user.address)).to.equal(
      apyBalance.sub(lockAmount)
    );

    await expect(blApy.connect(user).withdraw()).to.be.revertedWith(
      "The lock didn't expire"
    );

    await blApy.connect(deployer).shutdown();

    await expect(blApy.connect(user).withdraw()).to.not.be.reverted;
    expect(await apy.balanceOf(user.address)).to.equal(apyBalance);
  });
});
