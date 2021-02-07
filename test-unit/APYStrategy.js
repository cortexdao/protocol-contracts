const { assert } = require("chai");
const { ethers, artifacts, contract } = require("hardhat");
const { expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const GenericExecutor = artifacts.require("APYGenericExecutor");
const Strategy = artifacts.require("Strategy");
const ERC20 = artifacts.require("ERC20");
const ERC20_json = require("../artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json");

contract("Test Strategy", async (accounts) => {
  const [deployer, account1] = accounts;

  const erc20Interface = new ethers.utils.Interface(ERC20_json.abi);
  let CatERC20;
  let DogERC20;
  let executor;
  let strategy;

  before(async () => {
    // NOTE: I use real ERC20 contract here and not the MockContract such that real events are emitted
    CatERC20 = await ERC20.new("CatContract", "CAT");
    DogERC20 = await ERC20.new("DogContract", "DOG");
    executor = await GenericExecutor.new();
    strategy = await Strategy.new(executor.address);
  });

  it.only("Test Strategy Ownership", async () => {
    const owner = await strategy.owner();
    assert.equal(owner, deployer);
  });

  it.only("Test Strategy executor", async () => {
    const exe = await strategy.generalExecutor();
    assert.equal(exe, executor.address);
  });

  it.only("Test calling execute from non owner", async () => {
    const encodedApprove = erc20Interface.encodeFunctionData(
      "approve(address,uint256)",
      [account1, 100]
    );
    await expectRevert(
      strategy.execute(
        [
          [CatERC20.address, encodedApprove],
          [DogERC20.address, encodedApprove],
        ],
        { from: account1 }
      ),
      "revert Ownable: caller is not the owner"
    );
  });

  it.only("Test calling execute from owner", async () => {
    const encodedApprove = erc20Interface.encodeFunctionData(
      "approve(address,uint256)",
      [account1, 100]
    );
    const trx = await strategy.execute(
      [
        [CatERC20.address, encodedApprove],
        [DogERC20.address, encodedApprove],
      ],
      { from: deployer }
    );
    expectEvent.inTransaction(trx.tx, CatERC20, "Approval", {
      owner: strategy.address,
      spender: account1,
      value: "100",
    });
    expectEvent.inTransaction(trx.tx, DogERC20, "Approval", {
      owner: strategy.address,
      spender: account1,
      value: "100",
    });
  });

  it.only("Test calling execute with failed internal trx", async () => {
    const encodedApprove = erc20Interface.encodeFunctionData(
      "approve(address,uint256)",
      [account1, 100]
    );
    const encodedTransfer = erc20Interface.encodeFunctionData(
      "transfer(address,uint256)",
      [account1, 100]
    );
    await expectRevert(
      strategy.execute(
        [
          [CatERC20.address, encodedApprove],
          [CatERC20.address, encodedTransfer],
        ],
        { from: deployer }
      ),
      "revert ERC20: transfer amount exceeds balance"
    );
  });
});
