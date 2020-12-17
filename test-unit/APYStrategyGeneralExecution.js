const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder } = ethers.utils;
const GenericExecutor = artifacts.require("GenericExecutor");
const ContractA = artifacts.require("ContractA");
const { expectEvent } = require("@openzeppelin/test-helpers");

contract("Test GenericExecutor", async (accounts) => {
  it("Execution Test", async () => {
    const A = await ContractA.new()
    const iA = new ethers.utils.Interface(ContractA.abi)
    const exec = await GenericExecutor.new()

    const trx = await exec.execute(
      [
        [A.address, iA.encodeFunctionData('executeA', [100])],
        [A.address, iA.encodeFunctionData('executeAMultiParam', [1, 1, 1])],
        [A.address, iA.encodeFunctionData('executeAReturnArray', [1])],
        [A.address, iA.encodeFunctionData('executeAArrayParam', [100])],
        [A.address, iA.encodeFunctionData('approve', [A.address, 100])],
      ]
    )

    await expectEvent.inTransaction(trx.tx, A, 'ExecuteAUint256', { a: '100' })
    await expectEvent.inTransaction(trx.tx, A, 'ExecuteABytes32', { a: '0x0000000000000000000000000000000000000000000000000000000000000064' })
    await expectEvent.inTransaction(trx.tx, A, 'MultiParam', { a: '1', b: '1', c: '1' })
    await expectEvent.inTransaction(trx.tx, A, 'ExecuteAReturnArray', { a: ['10', '5'] })
    await expectEvent.inTransaction(trx.tx, A, 'ExecuteAArrayParam', { a: '100' })
    await expectEvent.inTransaction(trx.tx, A, 'Approve', { a: A.address, b: '100' })
  })
})