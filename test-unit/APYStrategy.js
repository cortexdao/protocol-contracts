const { assert } = require("chai");
const { ethers, artifacts, contract } = require("hardhat");
const { expectEvent, expectRevert } = require("@openzeppelin/test-helpers");
const GenericExecutor = artifacts.require("APYGenericExecutor");
const Strategy = artifacts.require("Strategy");
const ERC20 = artifacts.require("ERC20");

contract("Test Strategy", async (accounts) => {
  const [deployer, account1] = accounts;

  const erc20Interface = new ethers.utils.Interface(ERC20.abi);
  let TokenA;
  let TokenB;
  let executor;
  let strategy;

  before(async () => {
    // NOTE: I use a real ERC20 contract here since MockContract cannot emit events
    TokenA = await ERC20.new("TokenA", "A");
    TokenB = await ERC20.new("TokenB", "B");
    executor = await GenericExecutor.new();
    strategy = await Strategy.new(executor.address);
  });

  it("Test Strategy Ownership", async () => {
    const owner = await strategy.owner();
    assert.equal(owner, deployer);
  });

  it("Test Strategy executor", async () => {
    const exe = await strategy.generalExecutor();
    assert.equal(exe, executor.address);
  });

  it("Test calling execute from non owner", async () => {
    const encodedApprove = erc20Interface.encodeFunctionData(
      "approve(address,uint256)",
      [account1, 100]
    );
    await expectRevert(
      strategy.execute(
        [
          [TokenA.address, encodedApprove],
          [TokenB.address, encodedApprove],
        ],
        { from: account1 }
      ),
      "revert Ownable: caller is not the owner"
    );
  });

  it("Test calling execute from owner", async () => {
    const encodedApprove = erc20Interface.encodeFunctionData(
      "approve(address,uint256)",
      [account1, 100]
    );
    const trx = await strategy.execute(
      [
        [TokenA.address, encodedApprove],
        [TokenB.address, encodedApprove],
      ],
      { from: deployer }
    );
    expectEvent.inTransaction(trx.tx, TokenA, "Approval", {
      owner: strategy.address,
      spender: account1,
      value: "100",
    });
    expectEvent.inTransaction(trx.tx, TokenB, "Approval", {
      owner: strategy.address,
      spender: account1,
      value: "100",
    });
  });

  it("Test calling execute with failed internal trx", async () => {
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
          [TokenA.address, encodedApprove],
          [TokenA.address, encodedTransfer],
        ],
        { from: deployer }
      ),
      "revert ERC20: transfer amount exceeds balance"
    );
  });
});
