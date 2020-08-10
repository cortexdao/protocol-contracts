const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const {
  BN,
  ether,
  balance,
  send,
  constants,
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");

const APT = artifacts.require("APT");

contract("APT", async (accounts) => {
  const [deployer, manager, wallet, other] = accounts;
  let apt;

  beforeEach(async () => {
    apt = await APT.new();
    await apt.setManagerAddress(manager, { from: deployer });
  });

  it("mint reverts if not called by manager", async () => {
    await expectRevert(
      apt.mint(other, 1, { from: wallet }),
      "Only manager can call"
    );
  });

  it("manager can call mint", async () => {
    try {
      await apt.mint(other, 1, { from: manager });
    } catch {
      assert.fail("Manager could not call mint.");
    }
  });

  it("burn reverts if not called by manager", async () => {
    await expectRevert(
      apt.burn(other, 1, { from: wallet }),
      "Only manager can call"
    );
  });

  it("manager can call burn", async () => {
    try {
      await apt.burn(other, 0, { from: manager });
    } catch {
      assert.fail("Manager could not call burn.");
    }
  });

  it("setting manaager reverts if not called by owner", async () => {
    await expectRevert(
      apt.setManagerAddress(other, { from: wallet }),
      "Ownable: caller is not the owner"
    );
  });

  it("owner can set manager", async () => {
    await apt.setManagerAddress(other, { from: deployer });
    expect(await apt.manager()).to.equal(other);
  });

  it("mint adds specified amount to account", async () => {
    // TODO: see todo note in burn test; similar to that, we
    // should just use a mock to check we delegate correctly
    // to the internal _mint method
    expect(await apt.balanceOf(other)).to.bignumber.equal("0");

    const amount = "1";
    await apt.mint(other, amount, { from: manager });

    expect(await apt.balanceOf(other)).to.bignumber.equal(amount);
  });

  it("burn removes specified amount from account", async () => {
    // TODO: use a mock for the inherited _burn method and
    // then assert it is called with the right args; this
    // will let us avoid having to mint some tokens first.
    const amount = "1";
    await apt.mint(other, amount, { from: manager });
    await apt.burn(other, amount, { from: manager });

    expect(await apt.balanceOf(other)).to.bignumber.equal("0");
  });
});
