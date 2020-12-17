const { ethers, artifacts, contract } = require("hardhat");
const GenericExecutor = artifacts.require("APYGenericExecutor");
const { expectEvent } = require("@openzeppelin/test-helpers");
const legos = require('defi-legos')

contract("Test GenericExecutor", async (accounts) => {
  it("Execution Test", async () => {
    const exec = await GenericExecutor.new()

    console.log(legos.maker.addresses.DAI)

    // const trx = await exec.execute(
    //   [
    //     [legos.maker.addresses.DAI, iA.encodeFunctionData('executeA', [100])],
    //     [A.address, iA.encodeFunctionData('executeAMultiParam', [1, 1, 1])],
    //     [A.address, iA.encodeFunctionData('executeAReturnArray', [1])],
    //     [A.address, iA.encodeFunctionData('executeAArrayParam', [100])],
    //     [A.address, iA.encodeFunctionData('approve', [A.address, 100])],
    //   ]
    // )

    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAUint256', { a: '100' })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteABytes32', { a: '0x0000000000000000000000000000000000000000000000000000000000000064' })
    // await expectEvent.inTransaction(trx.tx, A, 'MultiParam', { a: '1', b: '1', c: '1' })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAReturnArray', { a: ['10', '5'] })
    // await expectEvent.inTransaction(trx.tx, A, 'ExecuteAArrayParam', { a: '100' })
    // await expectEvent.inTransaction(trx.tx, A, 'Approve', { a: A.address, b: '100' })
  })
})