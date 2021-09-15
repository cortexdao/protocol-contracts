const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { deployMockContract } = waffle;

const IDetailedERC20 = artifacts.readArtifactSync("IDetailedERC20");
const AddressRegistryV2 = artifacts.readArtifactSync("AddressRegistryV2");

describe("Contract: Erc20Allocation", () => {
  // signers
  let deployer;
  let emergencySafe;
  let lpSafe;
  let lpAccount;
  let mApt;
  let user;
  let anotherUser;

  // contract factories
  let Erc20Allocation;

  // deployed contracts
  let erc20Allocation;

  // use EVM snapshots for test isolation
  let snapshotId;

  let tokenMock_0;
  let tokenMock_1;

  const token_0 = {
    symbol: "TOKEN",
    decimals: 6,
  };
  const token_1 = {
    symbol: "ANOTHER_TOKEN",
    decimals: 18,
  };
  const userBalance = 42;
  const anotherUserBalance = 100;

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
      emergencySafe,
      lpSafe,
      lpAccount,
      mApt,
      user,
      anotherUser,
    ] = await ethers.getSigners();
    Erc20Allocation = await ethers.getContractFactory(
      "Erc20Allocation",
      lpSafe
    );
    const addressRegistryMock = await deployMockContract(
      deployer,
      AddressRegistryV2.abi
    );
    await addressRegistryMock.mock.emergencySafeAddress.returns(
      emergencySafe.address
    );
    await addressRegistryMock.mock.lpSafeAddress.returns(lpSafe.address);
    await addressRegistryMock.mock.lpAccountAddress.returns(lpAccount.address);
    await addressRegistryMock.mock.mAptAddress.returns(mApt.address);
    erc20Allocation = await Erc20Allocation.deploy(addressRegistryMock.address);

    // setup each mock ERC20 token
    tokenMock_0 = await deployMockContract(deployer, IDetailedERC20.abi);
    token_0.token = tokenMock_0.address;
    await tokenMock_0.mock.symbol.returns(token_0.symbol);
    await tokenMock_0.mock.decimals.returns(token_0.decimals);

    tokenMock_1 = await deployMockContract(deployer, IDetailedERC20.abi);
    token_1.token = tokenMock_1.address;
    await tokenMock_1.mock.symbol.returns(token_1.symbol);
    await tokenMock_1.mock.decimals.returns(token_1.decimals);

    await tokenMock_0.mock.balanceOf
      .withArgs(user.address)
      .returns(userBalance);
    await tokenMock_1.mock.balanceOf
      .withArgs(anotherUser.address)
      .returns(anotherUserBalance);
  });

  describe("Defaults", () => {
    it("Default admin role given to Emergency Safe", async () => {
      const DEFAULT_ADMIN_ROLE = await erc20Allocation.DEFAULT_ADMIN_ROLE();
      const memberCount = await erc20Allocation.getRoleMemberCount(
        DEFAULT_ADMIN_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(
        await erc20Allocation.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)
      ).to.be.true;
    });

    it("Contract role given to mAPT", async () => {
      const CONTRACT_ROLE = await erc20Allocation.CONTRACT_ROLE();
      const memberCount = await erc20Allocation.getRoleMemberCount(
        CONTRACT_ROLE
      );
      expect(memberCount).to.equal(1);
      expect(await erc20Allocation.hasRole(CONTRACT_ROLE, mApt.address)).to.be
        .true;
    });

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await erc20Allocation.LP_ROLE();
      const memberCount = await erc20Allocation.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await erc20Allocation.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });
  });

  describe("Adding and removing tokens", () => {
    describe("registerErc20Token", () => {
      it("LP Safe can call", async () => {
        await expect(
          erc20Allocation
            .connect(lpSafe)
            ["registerErc20Token(address,string,uint8)"](
              token_0.token,
              token_0.symbol,
              token_0.decimals
            )
        ).to.not.be.reverted;
        await expect(
          erc20Allocation
            .connect(lpSafe)
            ["registerErc20Token(address,string)"](
              token_0.token,
              token_0.symbol
            )
        ).to.not.be.reverted;
        await expect(
          erc20Allocation
            .connect(lpSafe)
            ["registerErc20Token(address)"](token_0.token)
        ).to.not.be.reverted;
      });

      it("mAPT can call single arg version only", async () => {
        await expect(
          erc20Allocation
            .connect(mApt)
            ["registerErc20Token(address,string,uint8)"](
              token_0.token,
              token_0.symbol,
              token_0.decimals
            )
        ).to.be.revertedWith("NOT_LP_ROLE");
        await expect(
          erc20Allocation
            .connect(mApt)
            ["registerErc20Token(address,string)"](
              token_0.token,
              token_0.symbol
            )
        ).to.be.revertedWith("NOT_LP_ROLE");
        await expect(
          erc20Allocation
            .connect(mApt)
            ["registerErc20Token(address)"](token_0.token)
        ).to.not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          erc20Allocation
            .connect(user)
            ["registerErc20Token(address,string,uint8)"](
              token_0.token,
              token_0.symbol,
              token_0.decimals
            )
        ).to.be.revertedWith("NOT_LP_ROLE");
        await expect(
          erc20Allocation
            .connect(user)
            ["registerErc20Token(address,string)"](
              token_0.token,
              token_0.symbol
            )
        ).to.be.revertedWith("NOT_LP_ROLE");
        await expect(
          erc20Allocation
            .connect(user)
            ["registerErc20Token(address)"](token_0.token)
        ).to.be.revertedWith("NOT_LP_OR_CONTRACT_ROLE");
      });

      it("registerErc20Token populates tokens correctly", async () => {
        await erc20Allocation["registerErc20Token(address,string,uint8)"](
          token_0.token,
          token_0.symbol,
          token_0.decimals
        );
        await erc20Allocation["registerErc20Token(address,string,uint8)"](
          token_1.token,
          token_1.symbol,
          token_1.decimals
        );
        let result = await erc20Allocation.tokens();
        // have to check in this cumbersome manner rather than a deep
        // equal, because Ethers returns each struct as an *array*
        // with struct fields set as properties
        expect(result[0].token).to.equal(token_0.token);
        expect(result[0].symbol).to.equal(token_0.symbol);
        expect(result[0].decimals).to.equal(token_0.decimals);
        expect(result[1].token).to.equal(token_1.token);
        expect(result[1].symbol).to.equal(token_1.symbol);
        expect(result[1].decimals).to.equal(token_1.decimals);
      });
    });

    describe("removeErc20Token", () => {
      it("LP Safe can call", async () => {
        await expect(
          erc20Allocation
            .connect(lpSafe)
            ["removeErc20Token(address)"](token_0.token)
        ).to.not.be.reverted;
      });

      it("Unpermissioned cannot call", async () => {
        await expect(
          erc20Allocation
            .connect(user)
            ["removeErc20Token(address)"](token_0.token)
        ).to.be.revertedWith("NOT_LP_ROLE");
      });

      it("removeErc20Token", async () => {
        await erc20Allocation["registerErc20Token(address,string,uint8)"](
          token_0.token,
          token_0.symbol,
          token_0.decimals
        );
        await erc20Allocation["registerErc20Token(address,string,uint8)"](
          token_1.token,
          token_1.symbol,
          token_1.decimals
        );

        await erc20Allocation.removeErc20Token(token_0.token);

        const tokens = await erc20Allocation.tokens();
        expect(await erc20Allocation.tokens()).to.have.lengthOf(1);
        expect(tokens[0].token).to.equal(token_1.token);
        expect(tokens[0].symbol).to.equal(token_1.symbol);
        expect(tokens[0].decimals).to.equal(token_1.decimals);

        await erc20Allocation.removeErc20Token(token_1.token);
        expect(await erc20Allocation.tokens()).to.be.empty;
      });
    });
  });

  it("balanceOf", async () => {
    // register mock tokens
    await erc20Allocation["registerErc20Token(address,string,uint8)"](
      token_0.token,
      token_0.symbol,
      token_0.decimals
    );
    await erc20Allocation["registerErc20Token(address,string,uint8)"](
      token_1.token,
      token_1.symbol,
      token_1.decimals
    );

    expect(await erc20Allocation.balanceOf(user.address, 0)).to.equal(
      userBalance
    );
    expect(await erc20Allocation.balanceOf(anotherUser.address, 1)).to.equal(
      anotherUserBalance
    );
  });
});
