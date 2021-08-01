const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const timeMachine = require("ganache-time-traveler");
const { FAKE_ADDRESS, ANOTHER_FAKE_ADDRESS } = require("../utils/helpers");
const { deployMockContract } = waffle;

const IDetailedERC20 = artifacts.readArtifactSync("IDetailedERC20");

describe.only("Contract: Erc20Allocation", () => {
  // signers
  let deployer;
  let user;
  let anotherUser;

  // contract factories
  let Erc20Allocation;

  // deployed contracts
  let erc20Allocation;

  // use EVM snapshots for test isolation
  let snapshotId;

  const token_0 = {
    token: FAKE_ADDRESS,
    symbol: "TOKEN",
    decimals: 6,
  };
  const token_1 = {
    token: ANOTHER_FAKE_ADDRESS,
    symbol: "ANOTHER_TOKEN",
    decimals: 18,
  };

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [deployer, user, anotherUser] = await ethers.getSigners();
    Erc20Allocation = await ethers.getContractFactory("Erc20Allocation");
    erc20Allocation = await Erc20Allocation.deploy();
  });

  describe("Adding and removing tokens", () => {
    it("addToken populates tokens correctly", async () => {
      await erc20Allocation["addToken(address,string,uint8)"](
        token_0.token,
        token_0.symbol,
        token_0.decimals
      );
      await erc20Allocation["addToken(address,string,uint8)"](
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

    it("removeToken", async () => {
      await erc20Allocation["addToken(address,string,uint8)"](
        token_0.token,
        token_0.symbol,
        token_0.decimals
      );
      await erc20Allocation["addToken(address,string,uint8)"](
        token_1.token,
        token_1.symbol,
        token_1.decimals
      );

      await erc20Allocation.removeToken(token_0.token);

      const tokens = await erc20Allocation.tokens();
      expect(await erc20Allocation.tokens()).to.have.lengthOf(1);
      expect(tokens[0].token).to.equal(token_1.token);
      expect(tokens[0].symbol).to.equal(token_1.symbol);
      expect(tokens[0].decimals).to.equal(token_1.decimals);

      await erc20Allocation.removeToken(token_1.token);
      expect(await erc20Allocation.tokens()).to.be.empty;
    });
  });

  describe("View functions read token info correctly", () => {
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

    beforeEach("Setup token list with mock ERC20s", async () => {
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

      // register mock tokens
      await erc20Allocation["addToken(address,string,uint8)"](
        token_0.token,
        token_0.symbol,
        token_0.decimals
      );
      await erc20Allocation["addToken(address,string,uint8)"](
        token_1.token,
        token_1.symbol,
        token_1.decimals
      );
    });

    it("symbolOf", async () => {
      expect(await erc20Allocation.symbolOf(0)).to.equal(token_0.symbol);
      expect(await erc20Allocation.symbolOf(1)).to.equal(token_1.symbol);
    });

    it("decimalsOf", async () => {
      expect(await erc20Allocation.decimalsOf(0)).to.equal(token_0.decimals);
      expect(await erc20Allocation.decimalsOf(1)).to.equal(token_1.decimals);
    });

    it("balanceOf", async () => {
      expect(await erc20Allocation.balanceOf(user.address, 0)).to.equal(
        userBalance
      );
      expect(await erc20Allocation.balanceOf(anotherUser.address, 1)).to.equal(
        anotherUserBalance
      );
    });
  });
});
