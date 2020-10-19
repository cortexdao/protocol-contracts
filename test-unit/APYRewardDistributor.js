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
const SIGNER = '0x6EAF0ab3455787bA10089800dB91F11fDf6370BE'
const SIGNER_2 = '0x6391391254B4C05d77DE6b6a6aBd82F2066d86f7'

async function generateSignature(key, nonce, recipient, amount) {
  const wallet = new ethers.Wallet(key)
  const hash = ethers.utils.solidityKeccak256(['uint256', 'address', 'uint256'], [nonce, recipient, amount])
  const message = ethers.utils.arrayify(hash)
  const signature = await wallet.signMessage(message)
  return signature
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
      await expectRevert.unspecified(rewardDistributor.setSigner(SIGNER_2, { from: recipient1 }))
    })

    it("Test setting signer", async () => {
      await rewardDistributor.setSigner(SIGNER_2, { from: owner })
      const newSigner = await rewardDistributor.signer.call()
      assert(newSigner, SIGNER_2)
    })
  })

  describe("Test Claiming", async () => {
    it("Test Signature mismatch", async () => {
      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      const signature = await generateSignature(process.env.PRIVATE_KEY, nonce, recipient1, 1)
      await expectRevert(rewardDistributor.claim(nonce, recipient1, 100, signature, { from: recipient1 }), "Invalid signature")
    });

    it("Test claiming nonce < user nonce", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.PRIVATE_KEY, nonce, recipient1, amount)
      await rewardDistributor.claim(nonce, recipient1, amount, signature, { from: recipient1 })

      //signature is created using nonce 0, when nonce = 1
      signature = await generateSignature(process.env.PRIVATE_KEY, nonce, recipient1, amount)
      await expectRevert(rewardDistributor.claim(nonce, recipient1, amount, signature, { from: recipient1 }), "Nonce Mismatch")
    });

    it("Test claiming nonce > user nonce", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.PRIVATE_KEY, nonce, recipient1, amount)
      await rewardDistributor.claim(nonce, recipient1, amount, signature, { from: recipient1 })

      //signature is created using nonce 2, when nonce = 1
      nonce = 2
      signature = await generateSignature(process.env.PRIVATE_KEY, nonce, recipient1, amount)
      await expectRevert(rewardDistributor.claim(nonce, recipient1, amount, signature, { from: recipient1 }), "Nonce Mismatch")
    });

    it("Test claiming more than available balance of contract", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount - 1)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.PRIVATE_KEY, nonce, recipient1, amount)
      await expectRevert(rewardDistributor.claim(nonce, recipient1, amount, signature, { from: recipient1 }), "Insufficient Funds")
    });

    it("Test claiming for another user", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.PRIVATE_KEY, nonce, recipient1, amount)
      await rewardDistributor.claim(nonce, recipient1, amount, signature, { from: recipient2 })
    });

    it("Test all funds can be removed from contract", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.PRIVATE_KEY, nonce, owner, amount)
      await rewardDistributor.claim(nonce, owner, amount, signature, { from: owner })
    });

    it("Test claiming when signer changes", async () => {
      const amount = 10
      const transfer = await ERC20.encodeFunctionData('transfer', [recipient1, amount])
      await mockToken.givenMethodReturnBool(transfer, true)

      const balanceOf = await ERC20.encodeFunctionData('balanceOf', [recipient1])
      await mockToken.givenMethodReturnUint(balanceOf, amount)

      let nonce = await rewardDistributor.accountNonces.call(recipient1)
      let signature = await generateSignature(process.env.PRIVATE_KEY, nonce, recipient1, amount)
      await rewardDistributor.claim(nonce, recipient1, amount, signature, { from: recipient1 })

      await rewardDistributor.setSigner(SIGNER_2, { from: owner })

      nonce = await rewardDistributor.accountNonces.call(recipient1)
      signature = await generateSignature(process.env.PRIVATE_KEY_2, nonce, recipient1, amount)
      await rewardDistributor.claim(nonce, recipient1, amount, signature, { from: recipient1 })
    });
  });
});
