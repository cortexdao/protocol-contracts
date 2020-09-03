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
  const [deployer, pool, wallet, other] = accounts;
  let apt;

  beforeEach(async () => {
    apt = await APT.new();
    await apt.setPoolAddress(pool, { from: deployer });
  });

  it("mint reverts if not called by pool", async () => {
    await expectRevert(
      apt.mint(other, 1, { from: wallet }),
      "Pool/access-not-allowed"
    );
  });

  it("pool can call mint", async () => {
    try {
      await apt.mint(other, 1, { from: pool });
    } catch {
      assert.fail("Pool could not call mint.");
    }
  });

  it("burn reverts if not called by Pool", async () => {
    await expectRevert(
      apt.burn(other, 1, { from: wallet }),
      "Pool/access-not-allowed"
    );
  });

  it("Pool can call burn", async () => {
    try {
      await apt.burn(other, 0, { from: pool });
    } catch {
      assert.fail("Pool could not call burn.");
    }
  });

  it("setting manaager reverts if not called by owner", async () => {
    await expectRevert(
      apt.setPoolAddress(other, { from: wallet }),
      "Ownable: caller is not the owner"
    );
  });

  it("owner can set pool", async () => {
    await apt.setPoolAddress(other, { from: deployer });
    expect(await apt.pool()).to.equal(other);
  });

  it("mint adds specified amount to account", async () => {
    // TODO: see todo note in burn test; similar to that, we
    // should just use a mock to check we delegate correctly
    // to the internal _mint method
    expect(await apt.balanceOf(other)).to.bignumber.equal("0");

    const amount = "1";
    await apt.mint(other, amount, { from: pool });

    expect(await apt.balanceOf(other)).to.bignumber.equal(amount);
  });

  it("burn removes specified amount from account", async () => {
    // TODO: use a mock for the inherited _burn method and
    // then assert it is called with the right args; this
    // will let us avoid having to mint some tokens first.
    const amount = "1";
    await apt.mint(other, amount, { from: pool });
    await apt.burn(other, amount, { from: pool });

    expect(await apt.balanceOf(other)).to.bignumber.equal("0");
  });
});
