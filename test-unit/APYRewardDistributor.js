const { ethers, artifacts, contract } = require("@nomiclabs/buidler");
const {
  BN,
  constants,
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers/src/constants");
const timeMachine = require("ganache-time-traveler");
const MockContract = artifacts.require("MockContract");
const ERC20 = new ethers.utils.Interface(artifacts.require("ERC20").abi);
const APYRewardDistributor = artifacts.require("APYRewardDistributor");
const SIGNER = process.env.ACCOUNT_1
const ROTATED_SIGNER = process.env.ACCOUNT_2
const DEV_CHAIN_ID = 31337

async function generateSignature(key, contract, nonce, recipient, amount, chain = DEV_CHAIN_ID) {
  const domain = {
    name: 'APY Distribution',
    version: '1',
    chainId: chain,
    verifyingContract: contract
  }
  const types = {
    Recipient: [
      { name: 'nonce', type: 'uint256' },
      { name: 'wallet', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ]
  }
  const data = {
    nonce: nonce,
    wallet: recipient,
    amount: amount
  }

  const provider = ethers.getDefaultProvider('mainnet', { projectId: process.env.INFURA_API_KEY })
  const wallet = new ethers.Wallet(key, provider)
  let signature = await wallet._signTypedData(domain, types, data)
  signature = signature.slice(2)
  const r = "0x" + signature.substring(0, 64);
  const s = "0x" + signature.substring(64, 128);
  const v = parseInt(signature.substring(128, 130), 16);
  return { r, s, v }
}

contract("APYRewardDistributor Unit Test", async (accounts) => {
  const [owner, recipient1, recipient2] = accounts;

  let rewardDistributor;
  let mockToken;
  let snapshotId;

  beforeEach(async () => {
    let snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    mockToken = await MockContract.new();
    rewardDistributor = await APYRewardDistributor.new(mockToken.address, SIGNER, { from: owner });
  });

  describe("Test Constructor", async () => {
    it("Test Invalid APY Address", async () => {
      await expectRevert(APYRewardDistributor.new(ZERO_ADDRESS, SIGNER, { from: owner }), "Invalid APY Address")
    })

    it("Test Invalid Signer Address", async () => {
      await expectRevert(APYRewardDistributor.new(mockToken.address, ZERO_ADDRESS, { from: owner }), "Invalid Signer Address")
    })
  })

  describe("Test Defaults", async () => {
    it("Test APY Contract set", async () => {
      const tokenAddress = await rewardDistributor.apyToken.call()
      assert(tokenAddress, mockToken.address)
    })

    it("Test Signer set", async () => {
      const signerAddress = await rewardDistributor.signer.call()
      assert(signerAddress, SIGNER)
    })

    it("Test Owner is set", async () => {
      const ownerAddress = await rewardDistributor.owner.call()
      assert(ownerAddress, owner)
    })
  })

  describe("Test Setters", async () => {
    it("Test setting signer by not owner", async () => {
      await expectRevert.unspecified(rewardDistributor.setSigner(ROTATED_SIGNER, { from: recipient1 }))
    })

    it("Test setting signer", async () => {
      await rewardDistributor.setSigner(ROTATED_SIGNER, { from: owner })
      const newSigner = await rewardDistributor.signer.call()
      assert(newSigner, ROTATED_SIGNER)
    })
  })

  describe("Test Claiming", async () => {
    it.only("Test Signature mismatch", async () => {
      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      const { r, s, v } = await generateSignature(process.env.ACCOUNT_1_PRIV, rewardDistributor.address, nonce.toString(), recipient1, 1)

      console.log(`r: ${r}`)
      console.log(`s: ${s}`)
      console.log(`v: ${v}`)

      const recipientData = [nonce.toString(), recipient1, 1]
      await rewardDistributor.claim(recipientData, v, r, s, { from: recipient1 })
      // await expectRevert(rewardDistributor.claim(recipientData, v, r, s, { from: recipient1 }), "Invalid Signature")
    });

    it("Test claiming nonce < user nonce", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.ACCOUNT_1_PRIV, rewardDistributor.address, nonce.toString(), recipient1, amount)
      await rewardDistributor.claim(nonce.toString(), recipient1, amount, signature, { from: recipient1 })

      //signature is created using nonce 0, when nonce = 1
      signature = await generateSignature(process.env.ACCOUNT_1_PRIV, rewardDistributor.address, nonce.toString(), recipient1, amount)
      await expectRevert(rewardDistributor.claim(nonce.toString(), recipient1, amount, signature, { from: recipient1 }), "Nonce Mismatch")
    });

    it("Test claiming nonce > user nonce", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.ACCOUNT_1_PRIV, rewardDistributor.address, nonce.toString(), recipient1, amount)
      await rewardDistributor.claim(nonce.toString(), recipient1, amount, signature, { from: recipient1 })

      //signature is created using nonce 2, when nonce = 1
      nonce = 2
      signature = await generateSignature(process.env.ACCOUNT_1_PRIV, rewardDistirbutor.address, nonce.toString(), recipient1, amount)
      await expectRevert(rewardDistributor.claim(nonce.toString(), recipient1, amount, signature, { from: recipient1 }), "Nonce Mismatch")
    });

    it("Test claiming more than available balance of contract", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount - 1)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.ACCOUNT_1_PRIV, rewardDistributor.address, nonce.toString(), recipient1, amount)
      await expectRevert(rewardDistributor.claim(nonce.toString(), recipient1, amount, signature, { from: recipient1 }), "Insufficient Funds")
    });

    it("Test claiming for another user", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.ACCOUNT_1_PRIV, rewardDistributor.address, nonce.toString(), recipient1, amount)
      await rewardDistributor.claim(nonce.toString(), recipient1, amount, signature, { from: recipient2 })
    });

    it("Test all funds can be removed from contract", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.ACCOUNT_1_PRIV, rewardDistributor.address, nonce.toString(), recipient1, amount)
      await rewardDistributor.claim(nonce.toString(), owner, amount, signature, { from: owner })
    });

    it("Test claiming when signer changes", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.ACCOUNT_1_PRIV, rewardDistributor.address, nonce.toString(), recipient1, amount)
      await rewardDistributor.claim(nonce.toString(), recipient1, amount, signature, { from: recipient1 })

      await rewardDistributor.setSigner(ROTATED_SIGNER, { from: owner })

      nonce = await rewardDistributor.accountNonces.call(recipient1)
      signature = await generateSignature(process.env.ACCOUNT_2_PRIV, rewardDistributor.address, nonce.toString(), recipient1, amount)
      await rewardDistributor.claim(nonce.toString(), recipient1, amount, signature, { from: recipient1 })
    });

    it("Test Claim event is emitted", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      const nonce = await rewardDistributor.accountNonces.call(recipient1)
      const signature = await generateSignature(process.env.ACCOUNT_1_PRIV, rewardDistributor.address, nonce.toString(), recipient1, amount)
      const trx = await rewardDistributor.claim(nonce.toString(), recipient1, amount, signature, { from: recipient1 })
      expectEvent(trx, "Claimed", { nonce: new BN(0), recipient: recipient1, amount: new BN(amount) })
    });
  });
});
