const { expect } = require("chai");
const hre = require("hardhat");
const { artifacts, ethers, waffle } = hre;
const { deployMockContract } = waffle;
const IDetailedERC20 = artifacts.require("IDetailedERC20");
const IStableSwap = artifacts.require("IStableSwap");

describe.only("Contract: CurvePeriphery", () => {
  let deployer;

  let CurvePeriphery;

  let curve;

  before(async () => {
    [deployer] = await ethers.getSigners();
    CurvePeriphery = await ethers.getContractFactory("CurvePeriphery");
    curve = await CurvePeriphery.deploy();
    await curve.deployed();
  });

  describe("Test calculating underlying assets from LP token balance", async () => {
    let stableSwapMock = await deployMockContract(deployer, IStableSwap.abi);
    let lpTokenMock = await deployMockContract(deployer, IDetailedERC20.abi);
    stableSwapMock.mock.lp_token.returns(lpTokenMock);

    it("Get the correct underlying balance", async () => {
      stableSwapMock.mock.balances.returns(1000);
      lpTokenMock.mock.balanceOf.returns(500);
      lpTokenMock.mock.totalSupply.returns(1000);

      const balance = await curve.getUnderlyingAsset(
        deployer.address,
        stableSwapMock.address,
        0
      );
      expect(balance).to.equal(500);
    });
  });
});
