const { ethers, artifacts, contract } = require("hardhat");
const BN = ethers.BigNumber
const { expect, use } = require("chai");
const { solidity } = require('ethereum-waffle');
use(solidity)

const GenericExecutor = artifacts.require("APYGenericExecutor");
const { expectEvent } = require("@openzeppelin/test-helpers");
const legos = require('defi-legos')

contract("Test GenericExecutor", async () => {
  it.only("Execution Test", async () => {

    const [signer1, signer2] = await ethers.getSigners()

    const DAI = await ethers.getContractAt(legos.maker.abis.DAI, legos.maker.addresses.DAI)
    const cDAI = await ethers.getContractAt(legos.compound.abis.cDAI, legos.compound.addresses.cDAI)

    const signer1Address = await signer1.getAddress();
    const signer2Address = await signer2.getAddress();

    const ethBal = await ethers.provider.getBalance(signer1Address)
    console.log(`ETH Balance: ${ethBal.toString()}`)

    const daiBal = await DAI.balanceOf(signer1Address)
    console.log(`DAI Balance: ${daiBal.toString()}`)

    const cDaiBal = await cDAI.balanceOf(signer1.getAddress())
    console.log(`cDAI Balance: ${cDaiBal.toString()}`)

    const errCode = await cDAI.callStatic.mint('9999')
    console.log(errCode.toString());

    const cDaiBal2 = await cDAI.balanceOf(signer1.getAddress())
    console.log(`cDAI Balance: ${cDaiBal2.toString()}`)

    const trans = DAI.approve(signer2Address, "999")
    // await expect(trans).to.emit(DAI, 'Approval')
    // console.log("first check passed")
    // console.log(trans)

    const exec = await GenericExecutor.new()
    const trx = exec.execute(
      [
        [legos.maker.addresses.DAI, legos.maker.codecs.DAI.encodeApprove(signer1Address, BN.from('999'))],
        [legos.compound.addresses.cDAI, legos.compound.codecs.cDAI.encodeMint('999')]
        // [legos.compound.addresses.cDAI, legos.maker.codecs.cDAI.encodeApprove(account1, BN.from('999'))],
      ]
    )

    // console.log(trx)
    // console.log(JSON.parse(JSON.stringify(trx.receipt.rawLogs)))

    await expect(trx).to.emit(DAI, ' Approval')

    // await expectEvent.inTransaction(trx.tx, DAI, 'Approval', { owner: exec.address, spender: signer1Address, value: '999' })

    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAUint256', { a: '100' })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteABytes32', { a: '0x0000000000000000000000000000000000000000000000000000000000000064' })
    // await expectEvent.inTransaction(trx.tx, A, 'MultiParam', { a: '1', b: '1', c: '1' })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAReturnArray', { a: ['10', '5'] })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAArrayParam', { a: '100' })
    // await expectEvent.inTransaction(trx.tx, A, 'Approve', { a: A.address, b: '100' })
  })
})