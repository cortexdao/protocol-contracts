const { ethers, artifacts, contract } = require("hardhat");
const BN = ethers.BigNumber
const GenericExecutor = artifacts.require("APYGenericExecutor");
const { expectEvent } = require("@openzeppelin/test-helpers");
const legos = require('defi-legos')

contract("Test GenericExecutor", async (accounts) => {
  const [_, account1] = accounts
  it.only("Execution Test", async () => {

    const DAI = new ethers.Contract(legos.maker.addresses.DAI, legos.maker.abis.DAI, ethers.getDefaultProvider());
    console.log(DAI)

    const exec = await GenericExecutor.new()

    // const trx = await exec.execute(
    //   [
    //     [legos.maker.addresses.DAI, legos.maker.DAI.encodeApprove(account1, BN.from('999'))],
    //     [legos.compound.addresses.cDAI, legos.maker.cDAI.encodeApprove(account1, BN.from('999'))],
    //   ]
    // )
    // await expectEvent.inTransaction(trx.tx, legos.maker, 'Approval', { owner: exec.address, spender: account1, value: '999' })

    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAUint256', { a: '100' })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteABytes32', { a: '0x0000000000000000000000000000000000000000000000000000000000000064' })
    // await expectEvent.inTransaction(trx.tx, A, 'MultiParam', { a: '1', b: '1', c: '1' })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAReturnArray', { a: ['10', '5'] })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAArrayParam', { a: '100' })
    // await expectEvent.inTransaction(trx.tx, A, 'Approve', { a: A.address, b: '100' })
  })
})