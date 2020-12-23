const { ethers, artifacts, contract, web3 } = require("hardhat");
const BN = ethers.BigNumber;

const GenericExecutor = artifacts.require("APYGenericExecutor");
const { expectEvent } = require("@openzeppelin/test-helpers");
// const legos = require("defi-legos");

contract("Test GenericExecutor", async () => {
  it("Execution Test", async () => {
    const [signer1] = await ethers.getSigners();
    const signer1Address = await signer1.getAddress();

    const DAI = new web3.eth.Contract(
      legos.maker.abis.DAI,
      legos.maker.addresses.DAI
    );
    const cDAI = new web3.eth.Contract(
      legos.compound.abis.cDAI,
      legos.compound.addresses.cDAI
    );

    const exec = await GenericExecutor.new();
    const trx = await exec.execute([
      [
        legos.maker.addresses.DAI,
        legos.maker.codecs.DAI.encodeApprove(
          legos.compound.addresses.cDAI,
          BN.from("999")
        ),
      ],
      [
        legos.compound.addresses.cDAI,
        legos.compound.codecs.cDAI.encodeMint("999"),
      ],
      // [legos.compound.addresses.cDAI, legos.maker.codecs.cDAI.encodeApprove(account1, BN.from('999'))],
    ]);

    await expectEvent.inTransaction(trx.tx, DAI, "Approval", {
      src: exec.address,
      guy: legos.compound.addresses.cDAI,
      wad: "999",
    });
    await expectEvent.inTransaction(trx.tx, cDAI, "Mint", {
      minter: exec.address,
      mintAmount: "999",
      mintTokens: "999",
    });
  });
});
