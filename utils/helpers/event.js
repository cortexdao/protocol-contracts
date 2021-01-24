const { expectEvent } = require("@openzeppelin/test-helpers");

async function expectEventInTransaction(
  txHash,
  emitter,
  eventName,
  eventArgs = {}
) {
  /*
  Ethers-wrapper for OpenZeppelin's test helper.

  Their test helper still works as long as BigNumber is passed-in as strings and
  the emitter has a Truffle-like interface, i.e. has properties `abi` and `address`.
  */
  const abi = JSON.parse(emitter.interface.format("json"));
  const address = emitter.address;
  const _emitter = { abi, address };
  const _eventArgs = Object.fromEntries(
    Object.entries(eventArgs).map(([k, v]) => [k, v.toString()])
  );
  await expectEvent.inTransaction(txHash, _emitter, eventName, _eventArgs);
}

module.exports = {
  expectEventInTransaction,
};
