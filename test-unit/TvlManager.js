const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, waffle, artifacts } = hre;
const { solidityKeccak256: hash, solidityPack: pack } = ethers.utils;
const { deployMockContract } = waffle;
const timeMachine = require("ganache-time-traveler");
const {
  FAKE_ADDRESS,
  tokenAmountToBigNumber,
  bytes32,
} = require("../utils/helpers");

describe("Contract: TvlManager", () => {
  // signers
  let deployer;
  let addressRegistry;
  let poolManager;
  let lpSafe;
  let emergencySafe;
  let oracleAdapter;
  let randomUser;

  // contract factories
  let TvlManager;

  // deployed contracts
  let tvlManager;

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
      poolManager,
      lpSafe,
      emergencySafe,
      randomUser,
    ] = await ethers.getSigners();

    addressRegistry = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );

    oracleAdapter = await deployMockContract(
      deployer,
      artifacts.require("IOracleAdapter").abi
    );
    await addressRegistry.mock.oracleAdapterAddress.returns(
      oracleAdapter.address
    );
    await oracleAdapter.mock.lock.returns();

    // These registered addresses are setup for roles in the
    // constructor for TvlManager
    await addressRegistry.mock.poolManagerAddress.returns(poolManager.address);
    await addressRegistry.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistry.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);

    TvlManager = await ethers.getContractFactory("TvlManager");

    tvlManager = await TvlManager.deploy(addressRegistry.address);
    await tvlManager.deployed();
  });

  describe("Defaults", () => {
    it("Default admin role given to Emergency Safe", async () => {
      const DEFAULT_ADMIN_ROLE = await tvlManager.DEFAULT_ADMIN_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(
        DEFAULT_ADMIN_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(
        await tvlManager.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)
      ).to.be.true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await tvlManager.EMERGENCY_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(EMERGENCY_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(EMERGENCY_ROLE, emergencySafe.address)).to
        .be.true;
    });

    it("Contract role given to Pool Manager", async () => {
      const CONTRACT_ROLE = await tvlManager.CONTRACT_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(CONTRACT_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(CONTRACT_ROLE, poolManager.address)).to.be
        .true;
    });

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await tvlManager.LP_ROLE();
      const memberCount = await tvlManager.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await tvlManager.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });
  });

  describe("Token registration", () => {
    describe("addAssetAllocation", async () => {
      it("Unpermissioned cannot call", async () => {
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        await expect(
          tvlManager
            .connect(randomUser)
            .addAssetAllocation(data, symbol, decimals)
        ).to.be.revertedWith("INVALID_ACCESS_CONTROL");
      });

      it("LP role can call", async () => {
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        await expect(
          tvlManager.connect(lpSafe).addAssetAllocation(data, symbol, decimals)
        ).to.not.be.reverted;
      });

      it("Contract role can call", async () => {
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        await expect(
          tvlManager
            .connect(poolManager)
            .addAssetAllocation(data, symbol, decimals)
        ).to.not.be.reverted;
      });

      it("Fails when attempting to register the same data twice", async () => {
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;
        await tvlManager
          .connect(lpSafe)
          .addAssetAllocation(data, symbol, decimals);
        await expect(
          tvlManager.connect(lpSafe).addAssetAllocation(data, symbol, decimals)
        ).to.be.revertedWith("DUPLICATE_DATA_DETECTED");
      });
    });

    describe("deregisterTokens", () => {
      it("Unpermissioned cannot call", async () => {
        const data = [FAKE_ADDRESS, bytes32("")];
        await expect(
          tvlManager.connect(randomUser).removeAssetAllocation(data)
        ).to.be.revertedWith("INVALID_ACCESS_CONTROL");
      });

      it("LP role can call", async () => {
        const data = [FAKE_ADDRESS, bytes32("")];
        await tvlManager.connect(lpSafe).addAssetAllocation(data, "FOO", 18);

        await expect(tvlManager.connect(lpSafe).removeAssetAllocation(data)).to
          .not.be.reverted;
      });

      it("Contract role can call", async () => {
        const data = [FAKE_ADDRESS, bytes32("")];
        await tvlManager
          .connect(poolManager)
          .addAssetAllocation(data, "FOO", 18);

        await expect(
          tvlManager.connect(poolManager).removeAssetAllocation(data)
        ).to.not.be.reverted;
      });

      it("Fails to remove if allocation does not exist", async () => {
        const data = [FAKE_ADDRESS, bytes32("")];
        await expect(
          tvlManager.connect(lpSafe).removeAssetAllocation(data)
        ).to.be.revertedWith("ALLOCATION_DOES_NOT_EXIST");
      });
    });

    it("isAssetAllocationRegistered", async () => {
      const data = [FAKE_ADDRESS, bytes32("")];
      const symbol = "FOO";
      const decimals = 18;
      await tvlManager
        .connect(lpSafe)
        .addAssetAllocation(data, symbol, decimals);

      expect(await tvlManager.isAssetAllocationRegistered(data)).to.be.true;
      expect(
        await tvlManager.isAssetAllocationRegistered([
          FAKE_ADDRESS,
          bytes32("1"),
        ])
      ).to.be.false;
    });

    describe("getAssetAllocationIds", () => {
      it("Retrieves single registered allocation", async () => {
        const data = [FAKE_ADDRESS, bytes32("")];
        const symbol = "FOO";
        const decimals = 18;

        const lookupId = await tvlManager.createId(data);

        const allocationIds = [lookupId];
        await tvlManager
          .connect(lpSafe)
          .addAssetAllocation(data, symbol, decimals);

        expect(await tvlManager.getAssetAllocationIds()).to.have.members(
          allocationIds
        );
        expect(await tvlManager.getAssetAllocationIds()).to.have.lengthOf(
          allocationIds.length
        );
      });

      it("Does not retrieve deregistered allocations", async () => {
        const allocation1 = [FAKE_ADDRESS, bytes32("1")];
        const allocation2 = [FAKE_ADDRESS, bytes32("2")];
        const allocation3 = [FAKE_ADDRESS, bytes32("3")];
        const symbol = "FOO";
        const decimals = 18;

        const allocationData = [allocation1, allocation2, allocation3];

        const allocationIds = [];
        for (let allocation of allocationData) {
          const lookupId = await tvlManager.createId(allocation);
          allocationIds.push(lookupId);
        }

        const leftoverIds = [allocationIds[0], allocationIds[1]];

        for (const data of allocationData) {
          await tvlManager
            .connect(lpSafe)
            .addAssetAllocation(data, symbol, decimals);
        }
        await tvlManager.connect(lpSafe).removeAssetAllocation(allocation3);

        expect(await tvlManager.getAssetAllocationIds()).to.have.members(
          leftoverIds
        );
        expect(await tvlManager.getAssetAllocationIds()).to.have.lengthOf(
          leftoverIds.length
        );
      });

      it("Returns allocations still registered after deregistration", async () => {
        const allocation1 = [FAKE_ADDRESS, bytes32("1")];
        const allocation2 = [FAKE_ADDRESS, bytes32("2")];
        const allocation3 = [FAKE_ADDRESS, bytes32("3")];
        const symbol = "FOO";
        const decimals = 18;

        const allocationData = [allocation1, allocation2, allocation3];

        const allocationIds = [];
        for (let allocation of allocationData) {
          const lookupId = await tvlManager.createId(allocation);
          allocationIds.push(lookupId);
        }

        for (const data of allocationData) {
          await tvlManager
            .connect(lpSafe)
            .addAssetAllocation(data, symbol, decimals);
        }
        await tvlManager.connect(lpSafe).removeAssetAllocation(allocation3);

        expect(await tvlManager.getAssetAllocationIds()).to.not.include(
          allocationIds[2]
        );
        expect(await tvlManager.getAssetAllocationIds()).to.have.lengthOf(2);

        await tvlManager.connect(lpSafe).removeAssetAllocation(allocation1);
        expect(await tvlManager.getAssetAllocationIds()).to.have.lengthOf(1);
        expect(await tvlManager.getAssetAllocationIds()).to.have.members([
          allocationIds[1],
        ]);
      });
    });
  });

  describe("balanceOf", () => {
    let peripheryContract;
    let peripheryAbi;

    before(async () => {
      peripheryAbi = [
        {
          name: "balance",
          inputs: [
            {
              internalType: "address",
              name: "Account",
              type: "address",
            },
          ],
          outputs: [
            {
              internalType: "uint256",
              name: "",
              type: "uint256",
            },
          ],
          stateMutability: "view",
          type: "function",
        },
      ];
      peripheryContract = await deployMockContract(deployer, peripheryAbi);
    });

    it("Call with address arg", async () => {
      const symbol = "FOO";
      const decimals = 18;
      const Account = FAKE_ADDRESS;
      // create the step to execute
      const iface = new ethers.utils.Interface(peripheryAbi);
      const encodedBalance = iface.encodeFunctionData("balance(address)", [
        Account,
      ]);
      const data = [peripheryContract.address, encodedBalance];
      // step execution should return a value
      const expectedBalance = tokenAmountToBigNumber(100);
      await peripheryContract.mock.balance
        .withArgs(Account)
        .returns(expectedBalance);

      await tvlManager
        .connect(lpSafe)
        .addAssetAllocation(data, symbol, decimals);

      const lookupId = await tvlManager.createId(data);

      const balance = await tvlManager.balanceOf(lookupId);
      expect(balance).to.equal(expectedBalance);
    });

    it("Call that reverts", async () => {
      const symbol = "FOO";
      const decimals = 18;
      const invalidAccount = FAKE_ADDRESS;
      // create the step to execute
      const iface = new ethers.utils.Interface(peripheryAbi);
      const encodedBalance = iface.encodeFunctionData("balance(address)", [
        invalidAccount,
      ]);
      const data = [peripheryContract.address, encodedBalance];
      // step execution will revert
      await peripheryContract.mock.balance.reverts();

      await tvlManager
        .connect(lpSafe)
        .addAssetAllocation(data, symbol, decimals);

      const lookupId = await tvlManager.createId(data);

      await expect(tvlManager.balanceOf(lookupId)).to.be.reverted;
    });

    it("Revert on unregistered ID", async () => {
      const symbol = "FOO";
      const decimals = 18;
      const data = [FAKE_ADDRESS, bytes32("")];
      await tvlManager
        .connect(lpSafe)
        .addAssetAllocation(data, symbol, decimals);

      const invalidData = [FAKE_ADDRESS, bytes32("1")];
      const lookupId = await tvlManager.createId(invalidData);

      await expect(tvlManager.balanceOf(lookupId)).to.be.revertedWith(
        "INVALID_ALLOCATION_ID"
      );
    });
  });

  it("symbolOf", async () => {
    const data = [FAKE_ADDRESS, bytes32("")];
    const symbol = "FOO";
    const decimals = 18;
    await tvlManager.connect(lpSafe).addAssetAllocation(data, symbol, decimals);

    const lookupId = await tvlManager.createId(data);
    expect(await tvlManager.symbolOf(lookupId)).to.equal(symbol);
  });

  it("decimalsOf", async () => {
    const data = [FAKE_ADDRESS, bytes32("")];
    const symbol = "FOO";
    const decimals = 18;
    await tvlManager.connect(lpSafe).addAssetAllocation(data, symbol, decimals);

    const lookupId = await tvlManager.createId(data);
    expect(await tvlManager.decimalsOf(lookupId)).to.equal(decimals);
  });

  it("createId", async () => {
    const data = [FAKE_ADDRESS, bytes32("randomDataInput")];
    const lookupId = hash(["bytes"], [pack(["address", "bytes"], data)]);
    expect(await tvlManager.createId(data)).to.equal(lookupId);
  });
});
