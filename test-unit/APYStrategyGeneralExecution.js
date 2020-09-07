const timeMachine = require('ganache-time-traveler');
const { ethers, web3, artifacts, contract } = require("@nomiclabs/buidler");
const { defaultAbiCoder: abiCoder, parseUnits } = ethers.utils;
const {
  BN,
  ether,
  balance,
  send,
  constants,
  expectEvent,
  expectRevert,
} = require("@openzeppelin/test-helpers");

const IERC20 = artifacts.require('IERC20')
const ERC20Interface = new ethers.utils.Interface(IERC20.abi)
const MockContract = artifacts.require("./MockContract.sol")
const APYStrategyGeneralExecutor = artifacts.require("APYStrategyGeneralExecutor");

contract("APYStrategyExecution", async (accounts) => {
  const [owner] = accounts;
  const amount = parseUnits('1000', 10);
  let mockERC20
  let ERC20Template
  let erc20_transfer
  let erc20_approve

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot['result'];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before("Setup", async () => {
    exec = await APYStrategyGeneralExecutor.new();
    mockERC20 = await MockContract.new()
  });

  describe("Test Execution", async () => {
    it("Test Execute Deposit success", async () => {
      const transferFrom = ERC20Interface.encodeFunctionData('transferFrom', [constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, 0])
      await mockERC20.givenMethodReturnBool(transferFrom, true)

      const trx = await exec.execute(
        mockERC20.address,
        amount,
        true,
        [
          [constants.ZERO_ADDRESS, constants.ZERO_BYTES32] // no execution steps
        ],
        { from: owner }
      );

      const transferFromCount = await mockERC20.invocationCountForMethod.call(transferFrom)
      assert.equal(1, transferFromCount.toNumber())
    })

    it("Test Execute Deposit fail", async () => {
      const transferFrom = ERC20Interface.encodeFunctionData('transferFrom', [constants.ZERO_ADDRESS, constants.ZERO_ADDRESS, 0])
      await mockERC20.givenMethodReturnBool(transferFrom, false)

      await expectRevert(
        exec.execute(
          mockERC20.address,
          amount,
          true,
          [
            [constants.ZERO_ADDRESS, constants.ZERO_BYTES32] // no execution steps
          ],
          { from: owner }
        ),
        'ERC20 operation did not succeed'
      )
    })

    it("Test Execute Withdraw success", async () => {
      const transfer = ERC20Interface.encodeFunctionData('transfer', [constants.ZERO_ADDRESS, 0])
      await mockERC20.givenMethodReturnBool(transfer, true)

      const trx = await exec.execute(
        mockERC20.address,
        amount,
        false,
        [
          [constants.ZERO_ADDRESS, constants.ZERO_BYTES32] // no execution steps
        ],
        { from: owner }
      )

      const transferCount = await mockERC20.invocationCountForMethod.call(transfer)
      assert.equal(1, transferCount.toNumber())
    })

    it("Test Execute Withdraw fail", async () => {
      const transfer = ERC20Interface.encodeFunctionData('transfer', [constants.ZERO_ADDRESS, 0])
      await mockERC20.givenMethodReturnBool(transfer, false)

      await expectRevert(
        exec.execute(
          mockERC20.address,
          amount,
          false,
          [
            [constants.ZERO_ADDRESS, constants.ZERO_BYTES32] // no execution steps
          ],
          { from: owner }
        ),
        'ERC20 operation did not succeed'
      )
    })

    it("Test Execute outbound success", async () => {

      const approve = ERC20Interface.encodeFunctionData('approve', [constants.ZERO_ADDRESS, 0])
      await mockERC20.givenMethodReturnBool(approve, true)

      const trx = await exec.execute(
        mockERC20.address,
        0,
        false,
        [
          [mockERC20.address, approve]
        ],
        { from: owner }
      )

      const approvalCount = await mockERC20.invocationCountForMethod.call(approve)
      assert.equal(1, approvalCount.toNumber())
    })

    it("Test Execute outbound fail", async () => {

      const approve = ERC20Interface.encodeFunctionData('approve', [constants.ZERO_ADDRESS, 0])
      await mockERC20.givenMethodRevertWithMessage(approve, "EXPECT_FAIL")

      await expectRevert(
        exec.execute(
          mockERC20.address,
          0,
          false,
          [
            [mockERC20.address, approve]
          ],
          { from: owner }
        ),
        "EXPECT_FAIL"
      )
    })
  })
});
