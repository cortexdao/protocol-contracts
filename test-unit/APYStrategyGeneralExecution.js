const { ethers, artifacts, contract, web3 } = require("hardhat");
const { waffle, deployMockContract } = require("ethereum-waffle");
const { expect } = require("chai");

const BN = ethers.BigNumber

const GenericExecutor = artifacts.require("APYGenericExecutor");
// const legos = require('defi-legos')

contract("Test GenericExecutor", async () => {
  it.skip("Execution Test", async () => {

    const [signer1, signer2] = await ethers.getSigners()

    const DAI = await deployMockContract(signer1, legos.maker.abis.DAI)
    const cDAI = await deployMockContract(signer1, legos.compound.abis.cDAI)
    await DAI.mock.approve.returns(true)
    await DAI.mock.balanceOf.returns('999')
    await cDAI.mock.mint.returns('0')
    await cDAI.mock.balanceOf.returns('0')

    const signer1Address = await signer1.getAddress();

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

    const exec = await GenericExecutor.new()

    const trx = await exec.execute(
      [
        [legos.maker.addresses.DAI, legos.maker.codecs.DAI.encodeApprove(signer1Address, BN.from('999'))],
        [legos.compound.addresses.cDAI, legos.compound.codecs.cDAI.encodeMint('999')]
        // [legos.compound.addresses.cDAI, legos.maker.codecs.cDAI.encodeApprove(account1, BN.from('999'))],
      ]
    )

    // await expect(trx).to.emit(DAI, ' Approval')

    // await expectEvent.inTransaction(trx.tx, legos.maker, 'Approval', { owner: exec.address, spender: account1, value: '999' })

    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAUint256', { a: '100' })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteABytes32', { a: '0x0000000000000000000000000000000000000000000000000000000000000064' })
    // await expectEvent.inTransaction(trx.tx, A, 'MultiParam', { a: '1', b: '1', c: '1' })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAReturnArray', { a: ['10', '5'] })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAArrayParam', { a: '100' })
    // await expectEvent.inTransaction(trx.tx, A, 'Approve', { a: A.address, b: '100' })
  })
})
