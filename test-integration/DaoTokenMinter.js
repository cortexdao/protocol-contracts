const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;
const timeMachine = require("ganache-time-traveler");
const {
  tokenAmountToBigNumber,
  impersonateAccount,
  getProxyAdmin,
} = require("../utils/helpers");

const SECONDS_IN_DAY = 86400;
const pinnedBlock = 14024402;
const defaultPinnedBlock = hre.config.networks.hardhat.forking.blockNumber;
const forkingUrl = hre.config.networks.hardhat.forking.url;

const GOV_TOKEN_ADDRESS = "0x95a4492F028aa1fd432Ea71146b433E7B4446611";
const BLAPY_TOKEN_ADDRESS = "0xDC9EFf7BB202Fd60dE3f049c7Ec1EfB08006261f";
const REWARD_DISTRIBUTOR_ADDRESS = "0x2E11558316df8Dde1130D81bdd8535f15f70B23d";

// default account 0 used in some old version of ganache
const DISTRIBUTOR_SIGNER = "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";
const DISTRIBUTOR_SIGNER_KEY =
  "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d";

async function generateSignature(
  key,
  contract,
  nonce,
  recipient,
  amount,
  chain = 1
) {
  const domain = {
    name: "APY Distribution",
    version: "1",
    chainId: chain,
    verifyingContract: contract,
  };
  const types = {
    Recipient: [
      { name: "nonce", type: "uint256" },
      { name: "wallet", type: "address" },
      { name: "amount", type: "uint256" },
    ],
  };
  const data = {
    nonce: nonce,
    wallet: recipient,
    amount: amount,
  };

  const provider = ethers.provider;
  const wallet = new ethers.Wallet(key, provider);
  let signature = await wallet._signTypedData(domain, types, data);
  signature = signature.slice(2);
  const r = "0x" + signature.substring(0, 64);
  const s = "0x" + signature.substring(64, 128);
  const v = parseInt(signature.substring(128, 130), 16);
  return { r, s, v };
}

describe.only("DaoTokenMinter", () => {
  // signers
  let deployer;
  let user;

  // deployed contracts
  let minter;
  let daoToken;
  let daoVotingEscrow;
  // MAINNET contracts
  let govToken;
  let blApy;
  let proxyAdmin;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Use newer pinned block for recently deployed contracts", async () => {
    await hre.network.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: forkingUrl,
          blockNumber: pinnedBlock,
        },
      },
    ]);
  });

  after("Reset to default pinned block", async () => {
    await hre.network.provider.send("hardhat_reset", [
      {
        forking: {
          jsonRpcUrl: forkingUrl,
          blockNumber: defaultPinnedBlock,
        },
      },
    ]);
  });

  before("Upgrade Governance Token for time-lock functionality", async () => {
    [deployer, user] = await ethers.getSigners();

    const proxy = await ethers.getContractAt(
      "TransparentUpgradeableProxy",
      GOV_TOKEN_ADDRESS
    );
    proxyAdmin = await getProxyAdmin(proxy.address);
    deployer = await impersonateAccount(await proxyAdmin.owner(), 1000);

    const GovernanceTokenV2 = await ethers.getContractFactory(
      "GovernanceTokenV2"
    );
    const logicV2 = await GovernanceTokenV2.connect(deployer).deploy();
    await proxyAdmin.connect(deployer).upgrade(proxy.address, logicV2.address);

    govToken = await GovernanceTokenV2.attach(proxy.address);
  });

  before("Attach to blAPY contract", async () => {
    blApy = await ethers.getContractAt("VotingEscrow", BLAPY_TOKEN_ADDRESS);
  });

  before("Deploy DAO token", async () => {
    const DaoToken = await ethers.getContractFactory("DaoToken");
    const logic = await DaoToken.deploy();
    const TransparentUpgradeableProxy = await ethers.getContractFactory(
      "TransparentUpgradeableProxy"
    );
    const initData = await logic.interface.encodeFunctionData(
      "initialize()",
      []
    );
    const proxy = await TransparentUpgradeableProxy.deploy(
      logic.address,
      proxyAdmin.address,
      initData
    );
    daoToken = await DaoToken.attach(proxy.address);
  });

  before("Deploy DAO Voting Escrow", async () => {
    const DaoVotingEscrow = await ethers.getContractFactory("DaoVotingEscrow");
    daoVotingEscrow = await DaoVotingEscrow.deploy(
      daoToken.address,
      "Boost-Lock CXD",
      "blCXD",
      "1.0.0"
    );
  });

  before("Deploy DAO token minter", async () => {
    const DaoTokenMinter = await ethers.getContractFactory("DaoTokenMinter");
    minter = await DaoTokenMinter.deploy(
      daoToken.address,
      daoVotingEscrow.address
    );
  });

  describe("Constructor", () => {
    it("Contract fails to deploy when passed invalid DAO address", async () => {
      const DaoTokenMinter = await ethers.getContractFactory("DaoTokenMinter");
      await expect(
        DaoTokenMinter.deploy(
          ethers.constants.AddressZero,
          daoVotingEscrow.address
        )
      ).to.be.revertedWith("INVALID_DAO_ADDRESS");
    });

    it("Contract fails to deploy when passed invalid Escrow address", async () => {
      const DaoTokenMinter = await ethers.getContractFactory("DaoTokenMinter");
      await expect(
        DaoTokenMinter.deploy(daoToken.address, ethers.constants.AddressZero)
      ).to.be.revertedWith("INVALID_ESCROW_ADDRESS");
    });
  });

  describe("Defaults", () => {
    it("Storage variable are set correctly", async () => {
      expect(await minter.APY_TOKEN_ADDRESS()).to.equal(govToken.address);
      expect(await minter.BLAPY_TOKEN_ADDRESS()).to.equal(blApy.address);
      expect(await minter.DAO_TOKEN_ADDRESS()).to.equal(daoToken.address);
      expect(await minter.VE_TOKEN_ADDRESS()).to.equal(daoVotingEscrow.address);
    });

    it("Mint fails", async () => {
      await expect(minter.connect(user).mint()).to.be.revertedWith(
        "AIRDROP_INACTIVE"
      );
    });

    it("Mint Boost Locked fails", async () => {
      await expect(minter.connect(user).mintBoostLocked()).to.be.revertedWith(
        "AIRDROP_INACTIVE"
      );
    });

    it("Claim APY and mint fails", async () => {
      await expect(minter.connect(user).claimApyAndMint()).to.be.revertedWith(
        "AIRDROP_INACTIVE"
      );
    });
  });

  describe("Regular mint", () => {
    let userBalance;

    before("Set lock end", async () => {
      const timestamp = (await ethers.provider.getBlock()).timestamp;
      const lockEnd = timestamp + SECONDS_IN_DAY * 7;
      await govToken.connect(deployer).setLockEnd(lockEnd);
    });

    before("Add minter as locker", async () => {
      await govToken.connect(deployer).addLocker(minter.address);
    });

    before("Prepare user APY balance", async () => {
      userBalance = tokenAmountToBigNumber("1000");
      await govToken.connect(deployer).transfer(user.address, userBalance);
    });

    it("Successfully mint DAO tokens", async () => {
      expect(await daoToken.balanceOf(user.address)).to.equal(0);
      await minter.connect(user).mint();
      expect(await daoToken.balanceOf(user.address)).to.equal(userBalance);
    });

    it("Unsuccessfully mint if minter isn't a locker", async () => {
      await govToken.connect(deployer).removeLocker(minter.address);
      await expect(minter.connect(user).mint()).to.be.revertedWith(
        "LOCKER_ONLY"
      );
    });

    it("Can't mint more with same APY tokens", async () => {
      await minter.connect(user).mint();
      await minter.connect(user).mint();
      expect(await daoToken.balanceOf(user.address)).to.equal(userBalance);
    });

    it("Can mint more after accumulating more APY", async () => {
      // mint using current APY balance
      await minter.connect(user).mint();
      // accumulate more APY and mint
      const transferAmount = tokenAmountToBigNumber("288");
      await govToken.connect(deployer).transfer(user.address, transferAmount);
      await minter.connect(user).mint();

      const expectedBalance = userBalance.add(transferAmount);
      expect(await daoToken.balanceOf(user.address)).to.equal(expectedBalance);
    });

    it("Can't mint after airdrop ends", async () => {
      const lockEnd = (await govToken.lockEnd()).toNumber();
      await ethers.provider.send("evm_setNextBlockTimestamp", [lockEnd]);
      await ethers.provider.send("evm_mine");

      await expect(minter.connect(user).mint()).to.be.revertedWith(
        "AIRDROP_INACTIVE"
      );
    });
  });

  describe("Boost-lock mint", () => {
    let userAPYBal;

    before("Set lock end", async () => {
      const timestamp = (await ethers.provider.getBlock()).timestamp;
      const lockEnd = timestamp + SECONDS_IN_DAY * 7; // lock ends in 1 week
      await govToken.connect(deployer).setLockEnd(lockEnd);
    });

    before("Add minter as locker", async () => {
      await govToken.connect(deployer).addLocker(minter.address);
    });

    before("Setup user delegation to daoToken", async () => {
      await daoVotingEscrow.connect(user).assign_delegate(minter.address);
    });

    before("Prepare user APY balance", async () => {
      userAPYBal = tokenAmountToBigNumber("1000");
      await govToken.connect(deployer).transfer(user.address, userAPYBal);
      await govToken.connect(user).approve(blApy.address, userAPYBal);
    });

    it("Successfully mint boost-locked DAO tokens", async () => {
      // create a lock longer than the lockEnd
      const currentTime = (await ethers.provider.getBlock()).timestamp;
      const unlockTime = ethers.BigNumber.from(
        currentTime + SECONDS_IN_DAY * 30 * 6
      ); // lock for 6 months
      await blApy.connect(user).create_lock(userAPYBal, unlockTime);

      // user first approves daoVotingEscrow to transfer DAO tokens after mint
      const [locked_blApy_balance] = await blApy.locked(user.address);
      await daoToken
        .connect(user)
        .approve(daoVotingEscrow.address, locked_blApy_balance);

      // mint the boost locked DAO tokens
      expect(await daoToken.balanceOf(user.address)).to.equal(0);
      await minter.connect(user).mintBoostLocked();
      expect((await daoVotingEscrow.locked(user.address))[0]).to.equal(
        locked_blApy_balance
      );
    });

    it("Unsuccessfully mint boost-locked DAO tokens if no locked blApy", async () => {
      await expect(minter.connect(user).mintBoostLocked()).to.be.revertedWith(
        "NO_BOOST_LOCKED_AMOUNT"
      );
    });

    it("Unsuccessfully mint boost-locked DAO tokens if locked blApy ends too early", async () => {
      // create a lock longer than the lockEnd
      const currentTime = (await ethers.provider.getBlock()).timestamp;
      const unlockTime = ethers.BigNumber.from(
        currentTime + SECONDS_IN_DAY * 6
      ); // lock ends in 6 days
      await blApy.connect(user).create_lock(userAPYBal, unlockTime);

      await expect(minter.connect(user).mintBoostLocked()).to.be.revertedWith(
        "BOOST_LOCK_ENDS_TOO_EARLY"
      );
    });
  });

  describe("Claim APY and mint", () => {
    let userBalance;
    let rewardDistributor;

    before(
      "Attach to MAINNET reward distributor and set test signer",
      async () => {
        rewardDistributor = await ethers.getContractAt(
          "RewardDistributor",
          REWARD_DISTRIBUTOR_ADDRESS
        );
        const distributorOwner = await impersonateAccount(
          await rewardDistributor.owner()
        );
        await rewardDistributor
          .connect(distributorOwner)
          .setSigner(DISTRIBUTOR_SIGNER);
      }
    );

    before("Set lock end", async () => {
      const timestamp = (await ethers.provider.getBlock()).timestamp;
      const lockEnd = timestamp + SECONDS_IN_DAY * 7;
      await govToken.connect(deployer).setLockEnd(lockEnd);
    });

    before("Add minter as locker", async () => {
      await govToken.connect(deployer).addLocker(minter.address);
    });

    before("Prepare user APY balance", async () => {
      userBalance = tokenAmountToBigNumber("1000");
      await govToken.connect(deployer).transfer(user.address, userBalance);
    });

    it("Successfully claim APY", async () => {
      const claimAmount = tokenAmountToBigNumber("123");
      const nonce = "0";
      const { v, r, s } = await generateSignature(
        DISTRIBUTOR_SIGNER_KEY,
        REWARD_DISTRIBUTOR_ADDRESS,
        nonce,
        user.address,
        claimAmount
      );
      let recipientData = [nonce, user.address, claimAmount];
      await expect(minter.claimApy(recipientData, v, r, s))
        .to.emit(govToken, "Transfer")
        .withArgs(rewardDistributor.address, user.address, claimAmount);
      expect(await govToken.balanceOf(user.address)).to.equal(
        userBalance.add(claimAmount)
      );
    });

    it("Successfully claim APY and mint DAO tokens", async () => {
      const claimAmount = tokenAmountToBigNumber("123");
      const nonce = "0";
      const { v, r, s } = await generateSignature(
        DISTRIBUTOR_SIGNER_KEY,
        REWARD_DISTRIBUTOR_ADDRESS,
        nonce,
        user.address,
        claimAmount
      );
      let recipientData = [nonce, user.address, claimAmount];

      expect(await daoToken.balanceOf(user.address)).to.equal(0);

      await minter.connect(user).claimApyAndMint(recipientData, v, r, s);

      const expectedBalance = userBalance.add(claimAmount);
      expect(await govToken.balanceOf(user.address)).to.equal(expectedBalance);
      expect(await daoToken.balanceOf(user.address)).to.equal(expectedBalance);
    });
  });
});
