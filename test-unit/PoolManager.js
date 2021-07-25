const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers } = hre;
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const timeMachine = require("ganache-time-traveler");
const {
  FAKE_ADDRESS,
  tokenAmountToBigNumber,
  bytes32,
} = require("../utils/helpers");
const { deployMockContract } = require("@ethereum-waffle/mock-contract");

describe("Contract: PoolManager", () => {
  // signers
  let deployer;
  let randomUser;
  let emergencySafe;
  let lpSafe;
  let tvlManager;

  // contract factories
  let PoolManager;
  let ProxyAdmin;

  // deployed contracts
  let poolManager;
  let underlyerMocks;
  let poolMocks;
  let mAptMock;
  let addressRegistryMock;

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
      randomUser,
      emergencySafe,
      lpSafe,
      tvlManager,
    ] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    PoolManager = await ethers.getContractFactory("TestPoolManager");
    const PoolManagerProxy = await ethers.getContractFactory(
      "PoolManagerProxy"
    );

    const logic = await PoolManager.deploy();
    await logic.deployed();

    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();

    mAptMock = await deployMockContract(
      deployer,
      artifacts.require("MetaPoolToken").abi
    );
    addressRegistryMock = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    await addressRegistryMock.mock.mAptAddress.returns(mAptMock.address);
    await addressRegistryMock.mock.getAddress
      .withArgs(bytes32("tvlManager"))
      .returns(tvlManager.address);
    // these addresses need to be registered to setup roles
    // in the PoolManager constructor:
    // - emergencySafe (default admin role, emergency role)
    // - lpSafe (LP role)
    await addressRegistryMock.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistryMock.mock.lpSafeAddress.returns(lpSafe.address);

    underlyerMocks = {};
    const underlyerSymbols = ["dai", "usdc", "usdt"];
    await Promise.all(
      underlyerSymbols.map(async (symbol) => {
        const underlyerMock = await deployMockContract(
          deployer,
          artifacts.require("IDetailedERC20").abi
        );

        await underlyerMock.mock.decimals.returns(
          tokenAmountToBigNumber("18", "0")
        );

        underlyerMocks[symbol] = underlyerMock;
      })
    );

    poolMocks = {};
    await Promise.all(
      underlyerSymbols.map(async (symbol) => {
        const poolId = bytes32(`${symbol}Pool`);
        const poolMock = await deployMockContract(
          deployer,
          artifacts.require("PoolTokenV2").abi
        );

        await poolMock.mock.underlyer.returns(underlyerMocks[symbol].address);
        await poolMock.mock.getUnderlyerPrice.returns(
          tokenAmountToBigNumber("1", "8")
        );
        await addressRegistryMock.mock.getAddress
          .withArgs(poolId)
          .returns(poolMock.address);

        poolMocks[poolId] = poolMock;
      })
    );

    const proxy = await PoolManagerProxy.deploy(
      logic.address,
      proxyAdmin.address,
      addressRegistryMock.address
    );
    await proxy.deployed();
    poolManager = await PoolManager.attach(proxy.address);
  });

  describe("Defaults", () => {
    it("Default admin role given to emergency safe", async () => {
      const DEFAULT_ADMIN_ROLE = await poolManager.DEFAULT_ADMIN_ROLE();
      const memberCount = await poolManager.getRoleMemberCount(
        DEFAULT_ADMIN_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(
        await poolManager.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)
      ).to.be.true;
    });

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await poolManager.LP_ROLE();
      const memberCount = await poolManager.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await poolManager.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await poolManager.EMERGENCY_ROLE();
      const memberCount = await poolManager.getRoleMemberCount(EMERGENCY_ROLE);
      expect(memberCount).to.equal(1);
      expect(await poolManager.hasRole(EMERGENCY_ROLE, emergencySafe.address))
        .to.be.true;
    });
  });

  describe("Set address registry", () => {
    it("Emergency Safe can set to contract address", async () => {
      const contract = await deployMockContract(deployer, []);
      await poolManager
        .connect(emergencySafe)
        .setAddressRegistry(contract.address);
      expect(await poolManager.addressRegistry()).to.equal(contract.address);
    });

    it("Unpermissioned cannot set", async () => {
      const contract = await deployMockContract(deployer, []);
      await expect(
        poolManager.connect(randomUser).setAddressRegistry(contract.address)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Cannot set to non-contract address", async () => {
      await expect(
        poolManager.connect(emergencySafe).setAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });
  });

  describe("Setting admin address", () => {
    it("Emergency Safe can set to valid address", async () => {
      await poolManager.connect(emergencySafe).setAdminAddress(FAKE_ADDRESS);
      expect(await poolManager.proxyAdmin()).to.equal(FAKE_ADDRESS);
    });

    it("Unpermissioned cannot set", async () => {
      await expect(
        poolManager.connect(randomUser).setAdminAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        poolManager.connect(emergencySafe).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });
  });

  describe("LP Safe Funder", () => {
    describe("_getPoolsAndAmounts", async () => {
      it("Return empty arrays when given an empty array", async () => {
        const emptyPoolAmounts = [];
        const emptyPoolsAndAmounts = [[], []];
        const result = await poolManager.getPoolsAndAmounts(emptyPoolAmounts);
        expect(result).to.deep.equal(emptyPoolsAndAmounts);
      });

      it("Return pools and amounts when given a PoolAmount array", async () => {
        const poolAmounts = [
          {
            poolId: bytes32("daiPool"),
            amount: tokenAmountToBigNumber("1", "18"),
          },
          {
            poolId: bytes32("usdcPool"),
            amount: tokenAmountToBigNumber("2", "6"),
          },
        ];
        const poolsAndAmounts = [
          poolAmounts.map((p) => poolMocks[p.poolId].address),
          poolAmounts.map((p) => p.amount),
        ];
        const result = await poolManager.getPoolsAndAmounts(poolAmounts);
        expect(result).to.deep.equal(poolsAndAmounts);
      });
    });

    describe("_calculateMaptDeltas", async () => {
      it("Revert if array lengths do not match", async () => {
        const pools = Object.values(poolMocks).map((p) => p.address);
        const amounts = new Array(pools.length - 1).fill(
          tokenAmountToBigNumber("1", "18")
        );

        await expect(
          poolManager.calculateMaptDeltas(mAptMock.address, pools, amounts)
        ).to.be.revertedWith("LENGTHS_MUST_MATCH");
      });

      it("Revert if there is a zero amount", async () => {
        const pools = Object.values(poolMocks).map((p) => p.address);
        const amounts = new Array(pools.length).fill(
          tokenAmountToBigNumber("0", "18")
        );

        await expect(
          poolManager.calculateMaptDeltas(mAptMock.address, pools, amounts)
        ).to.be.revertedWith("INVALID_AMOUNT");
      });

      it("Return an empty array when given empty arrays", async () => {
        const pools = [];
        const amounts = [];

        const result = await poolManager.calculateMaptDeltas(
          mAptMock.address,
          pools,
          amounts
        );
        expect(result).to.deep.equal([]);
      });

      it("Return negative deltas when amounts are negative", async () => {
        const pools = Object.values(poolMocks).map((p) => p.address);
        const amounts = new Array(pools.length).fill(
          tokenAmountToBigNumber("-1", "18")
        );

        const mAptDelta = tokenAmountToBigNumber("1", "18");
        await mAptMock.mock.calculateMintAmount.returns(mAptDelta);

        const expected = new Array(pools.length).fill(mAptDelta.mul("-1"));

        const result = await poolManager.calculateMaptDeltas(
          mAptMock.address,
          pools,
          amounts
        );

        expect(result).to.deep.equal(expected);
      });

      it("Return positive deltas when amounts are positive", async () => {
        const pools = Object.values(poolMocks).map((p) => p.address);
        const amounts = new Array(pools.length).fill(
          tokenAmountToBigNumber("1", "18")
        );

        const mAptDelta = tokenAmountToBigNumber("1", "18");
        await mAptMock.mock.calculateMintAmount.returns(mAptDelta);

        const expected = new Array(pools.length).fill(mAptDelta.mul("1"));

        const result = await poolManager.calculateMaptDeltas(
          mAptMock.address,
          pools,
          amounts
        );

        expect(result).to.deep.equal(expected);
      });
    });

    describe("rebalanceReserves", async () => {
      it("LP Safe can call", async () => {
        await expect(poolManager.connect(lpSafe).rebalanceReserves([])).to.not
          .be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          poolManager.connect(randomUser).rebalanceReserves([])
        ).to.be.revertedWith("NOT_LP_ROLE");
      });

      it("Revert on unregistered LP Safe address", async () => {
        await addressRegistryMock.mock.lpSafeAddress.returns(ZERO_ADDRESS);
        await expect(
          poolManager.connect(lpSafe).rebalanceReserves([])
        ).to.be.revertedWith("INVALID_LP_SAFE");
      });
    });

    describe("emergencyRebalanceReserves", async () => {
      it("Emergency Safe can call", async () => {
        await expect(
          poolManager.connect(emergencySafe).emergencyRebalanceReserves([])
        ).to.not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          poolManager.connect(randomUser).emergencyRebalanceReserves([])
        ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
      });

      it("Revert on unregistered Emergency Safe address", async () => {
        await addressRegistryMock.mock.emergencySafeAddress.returns(
          ZERO_ADDRESS
        );
        await expect(
          poolManager.connect(emergencySafe).emergencyRebalanceReserves([])
        ).to.be.revertedWith("INVALID_EMERGENCY_SAFE");
      });
    });
  });
});
