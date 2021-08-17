const { expect } = require("chai");
const { ethers, web3, artifacts, waffle } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const {
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
  tokenAmountToBigNumber,
  bytes32,
} = require("../utils/helpers");
const { deployMockContract } = waffle;
const OracleAdapter = artifacts.readArtifactSync("OracleAdapter");
const PoolTokenV2 = artifacts.readArtifactSync("PoolTokenV2");
const IERC20 = artifacts.readArtifactSync("IDetailedERC20");

const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);

const usdc = (amount) => tokenAmountToBigNumber(amount, "6");
const dai = (amount) => tokenAmountToBigNumber(amount, "18");
const ether = (amount) => tokenAmountToBigNumber(amount, "18");

describe.only("Contract: MetaPoolToken", () => {
  // signers
  let deployer;
  let emergencySafe;
  let lpSafe;
  let randomUser;
  let anotherUser;

  // contract factories
  // have to be set async in "before"
  let ProxyAdmin;
  let MetaPoolTokenProxy;
  let MetaPoolToken;

  // deployed contracts
  let proxyAdmin;
  let logic;
  let proxy;
  let mApt;

  // default settings
  // mocks have to be done async in "before"
  let oracleAdapterMock;
  let addressRegistryMock;

  // use EVM snapshots for test isolation
  let snapshotId;

  beforeEach(async () => {
    const snapshot = await timeMachine.takeSnapshot();
    snapshotId = snapshot["result"];
  });

  afterEach(async () => {
    await timeMachine.revertToSnapshot(snapshotId);
  });

  before(async () => {
    [
      deployer,
      emergencySafe,
      lpSafe,
      randomUser,
      anotherUser,
    ] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    MetaPoolTokenProxy = await ethers.getContractFactory("MetaPoolTokenProxy");
    MetaPoolToken = await ethers.getContractFactory("TestMetaPoolToken");

    addressRegistryMock = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    await addressRegistryMock.mock.getAddress
      .withArgs(bytes32("emergencySafe"))
      .returns(emergencySafe.address);
    await addressRegistryMock.mock.lpSafeAddress.returns(lpSafe.address);

    oracleAdapterMock = await deployMockContract(deployer, OracleAdapter.abi);
    await addressRegistryMock.mock.oracleAdapterAddress.returns(
      oracleAdapterMock.address
    );

    proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.deployed();
    logic = await MetaPoolToken.deploy();
    await logic.deployed();
    proxy = await MetaPoolTokenProxy.deploy(
      logic.address,
      proxyAdmin.address,
      addressRegistryMock.address
    );
    await proxy.deployed();
    mApt = await MetaPoolToken.attach(proxy.address);

    // allows mAPT to mint and burn
    await oracleAdapterMock.mock.lock.returns();
  });

  describe("Constructor", () => {
    it("Revert when logic is not a contract address", async () => {
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          DUMMY_ADDRESS,
          proxyAdmin.address,
          DUMMY_ADDRESS
        )
      ).to.be.revertedWith(
        "UpgradeableProxy: new implementation is not a contract"
      );
    });

    it("Revert when proxy admin is zero address", async () => {
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          logic.address,
          ZERO_ADDRESS,
          DUMMY_ADDRESS
        )
      ).to.be.reverted;
    });

    it("Revert when address registry is zero address", async () => {
      await expect(
        MetaPoolTokenProxy.connect(deployer).deploy(
          logic.address,
          DUMMY_ADDRESS,
          ZERO_ADDRESS
        )
      ).to.be.reverted;
    });
  });

  describe("Defaults", () => {
    it("Default admin role given to Emergency Safe", async () => {
      const DEFAULT_ADMIN_ROLE = await mApt.DEFAULT_ADMIN_ROLE();
      const memberCount = await mApt.getRoleMemberCount(DEFAULT_ADMIN_ROLE);
      expect(memberCount).to.equal(1);
      expect(await mApt.hasRole(DEFAULT_ADMIN_ROLE, emergencySafe.address)).to
        .be.true;
    });

    it("LP role given to LP Safe", async () => {
      const LP_ROLE = await mApt.LP_ROLE();
      const memberCount = await mApt.getRoleMemberCount(LP_ROLE);
      expect(memberCount).to.equal(1);
      expect(await mApt.hasRole(LP_ROLE, lpSafe.address)).to.be.true;
    });

    it("Emergency role given to Emergency Safe", async () => {
      const EMERGENCY_ROLE = await mApt.EMERGENCY_ROLE();
      const memberCount = await mApt.getRoleMemberCount(EMERGENCY_ROLE);
      expect(memberCount).to.equal(1);
      expect(await mApt.hasRole(EMERGENCY_ROLE, emergencySafe.address)).to.be
        .true;
    });

    it("Name set to correct value", async () => {
      expect(await mApt.name()).to.equal("APY MetaPool Token");
    });

    it("Symbol set to correct value", async () => {
      expect(await mApt.symbol()).to.equal("mAPT");
    });

    it("Decimals set to correct value", async () => {
      expect(await mApt.decimals()).to.equal(18);
    });

    it("Admin set correctly", async () => {
      expect(await mApt.proxyAdmin()).to.equal(proxyAdmin.address);
    });

    it("Address registry set correctly", async () => {
      expect(await mApt.addressRegistry()).to.equal(
        addressRegistryMock.address
      );
    });
  });

  describe("emergencySetAddressRegistry", () => {
    it("Emergency Safe can set to valid address", async () => {
      const contractAddress = (await deployMockContract(deployer, [])).address;
      await mApt
        .connect(emergencySafe)
        .emergencySetAddressRegistry(contractAddress);
      expect(await mApt.addressRegistry()).to.equal(contractAddress);
    });

    it("Revert when unpermissioned attempts to set", async () => {
      const contractAddress = (await deployMockContract(deployer, [])).address;
      await expect(
        mApt.connect(randomUser).emergencySetAddressRegistry(contractAddress)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Cannot set to non-contract address", async () => {
      await expect(
        mApt.connect(emergencySafe).emergencySetAddressRegistry(FAKE_ADDRESS)
      ).to.be.revertedWith("INVALID_ADDRESS");
    });
  });

  describe("emergencySetAdminAddress", () => {
    it("Emergency Safe can set to valid address", async () => {
      await mApt
        .connect(emergencySafe)
        .emergencySetAdminAddress(randomUser.address);
      expect(await mApt.proxyAdmin()).to.equal(randomUser.address);
    });

    it("Revert when unpermissioned attempts to set", async () => {
      await expect(
        mApt.connect(randomUser).emergencySetAdminAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        mApt.connect(emergencySafe).emergencySetAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });
  });

  describe.only("_mintAndTransfer", () => {
    it("No minting or transfers for zero mint amount", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await pool.mock.transferToLpSafe.reverts();

      const mintAmount = 0;
      const transferAmount = 100;

      const prevTotalSupply = await mApt.totalSupply();
      await expect(
        mApt.testMintAndTransfer(pool.address, mintAmount, transferAmount)
      ).to.not.be.reverted;
      expect(await mApt.totalSupply()).to.equal(prevTotalSupply);
    });

    it("Transfer if there is minting", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);

      const mintAmount = tokenAmountToBigNumber(10, await mApt.decimals());
      const transferAmount = 100;

      // check pool's transfer funciton gets called
      await pool.mock.transferToLpSafe.revertsWithReason("TRANSFER_TO_LP_SAFE");
      await expect(
        mApt.testMintAndTransfer(pool.address, mintAmount, transferAmount)
      ).to.be.revertedWith("TRANSFER_TO_LP_SAFE");

      const expectedSupply = (await mApt.totalSupply()).add(mintAmount);
      // reset pool mock to check if supply changes as expected
      await pool.mock.transferToLpSafe.returns();
      await mApt.testMintAndTransfer(pool.address, mintAmount, transferAmount);
      expect(await mApt.totalSupply()).to.equal(expectedSupply);
    });

    it("No minting if transfer reverts", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await pool.mock.transferToLpSafe.revertsWithReason("TRANSFER_FAILED");

      const mintAmount = tokenAmountToBigNumber(10, await mApt.decimals());
      const transferAmount = 100;

      const prevTotalSupply = await mApt.totalSupply();
      await expect(
        mApt.testMintAndTransfer(pool.address, mintAmount, transferAmount)
      ).to.be.revertedWith("TRANSFER_FAILED");
      expect(await mApt.totalSupply()).to.equal(prevTotalSupply);
    });
  });

  describe.only("_burnAndTransfer", () => {
    it("No burning or transfers for zero burn amount", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      await pool.mock.underlyer.reverts();

      const burnAmount = 0;
      const transferAmount = 100;

      const prevTotalSupply = await mApt.totalSupply();
      await expect(
        mApt.testBurnAndTransfer(
          pool.address,
          lpSafe.address,
          burnAmount,
          transferAmount
        )
      ).to.not.be.reverted;
      expect(await mApt.totalSupply()).to.equal(prevTotalSupply);
    });

    it("Transfer if there is burning", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      const underlyer = await deployMockContract(deployer, IERC20.abi);
      await pool.mock.underlyer.returns(underlyer.address);

      const burnAmount = tokenAmountToBigNumber(10, await mApt.decimals());
      const transferAmount = 100;

      await mApt.testMint(pool.address, burnAmount);

      // check pool's transfer function gets called
      await underlyer.mock.transferFrom.reverts();
      await expect(
        mApt.testBurnAndTransfer(
          pool.address,
          lpSafe.address,
          burnAmount,
          transferAmount
        )
      ).to.be.revertedWith("SafeERC20: low-level call failed");

      const expectedSupply = (await mApt.totalSupply()).sub(burnAmount);
      // reset underlyer mock to check if supply changes as expected
      await underlyer.mock.transferFrom.returns(true);
      await mApt.testBurnAndTransfer(
        pool.address,
        lpSafe.address,
        burnAmount,
        transferAmount
      );
      expect(await mApt.totalSupply()).to.equal(expectedSupply);
    });

    it("No burning if transfer reverts", async () => {
      const pool = await deployMockContract(deployer, PoolTokenV2.abi);
      const underlyer = await deployMockContract(deployer, IERC20.abi);
      await pool.mock.underlyer.returns(underlyer.address);
      await underlyer.mock.transferFrom.reverts();

      const burnAmount = tokenAmountToBigNumber(10, await mApt.decimals());
      const transferAmount = 100;

      await mApt.testMint(pool.address, burnAmount);

      const prevTotalSupply = await mApt.totalSupply();
      await expect(
        mApt.testBurnAndTransfer(
          pool.address,
          lpSafe.address,
          burnAmount,
          transferAmount
        )
      ).to.be.revertedWith("SafeERC20: low-level call failed");
      expect(await mApt.totalSupply()).to.equal(prevTotalSupply);
    });
  });

  describe("_multipleMintAndTransfer", () => {
    it("Locks after minting", async () => {
      //
    });
  });

  describe("_multipleBurnAndTransfer", () => {
    it("Locks after burning", async () => [
      //
    ]);
  });

  describe("getDeployedValue", () => {
    it("Return 0 if zero mAPT supply", async () => {
      expect(await mApt.totalSupply()).to.equal("0");
      expect(await mApt.getDeployedValue(FAKE_ADDRESS)).to.equal("0");
    });

    it("Return 0 if zero mAPT balance", async () => {
      await mApt.testMint(FAKE_ADDRESS, tokenAmountToBigNumber(1000));
      expect(await mApt.getDeployedValue(ANOTHER_FAKE_ADDRESS)).to.equal(0);
    });

    it("Returns calculated value for non-zero mAPT balance", async () => {
      const tvl = ether("502300");
      const balance = tokenAmountToBigNumber("1000");
      const anotherBalance = tokenAmountToBigNumber("12345");
      const totalSupply = balance.add(anotherBalance);

      await oracleAdapterMock.mock.getTvl.returns(tvl);
      await mApt.testMint(FAKE_ADDRESS, balance);
      await mApt.testMint(ANOTHER_FAKE_ADDRESS, anotherBalance);

      const expectedValue = tvl.mul(balance).div(totalSupply);
      expect(await mApt.getDeployedValue(FAKE_ADDRESS)).to.equal(expectedValue);
    });
  });

  describe("Calculations", () => {
    it("Calculate mint amount with zero deployed TVL", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      let usdcAmount = usdc(107);
      let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await oracleAdapterMock.mock.getTvl.returns(0);

      await mApt.testMint(anotherUser.address, tokenAmountToBigNumber(100));

      const mintAmount = await mApt.testCalculateDelta(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      const expectedMintAmount = usdcValue.mul(
        await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate mint amount with zero total supply", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      let usdcAmount = usdc(107);
      let usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await oracleAdapterMock.mock.getTvl.returns(1);

      const mintAmount = await mApt.testCalculateDelta(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      const expectedMintAmount = usdcValue.mul(
        await mApt.DEFAULT_MAPT_TO_UNDERLYER_FACTOR()
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate mint amount with non-zero total supply", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      let usdcAmount = usdc(107);
      let tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await oracleAdapterMock.mock.getTvl.returns(tvl);

      const totalSupply = tokenAmountToBigNumber(21);
      await mApt.testMint(anotherUser.address, totalSupply);

      let mintAmount = await mApt.testCalculateDelta(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      expect(mintAmount).to.be.equal(totalSupply);

      tvl = usdcEthPrice.mul(usdcAmount.mul(2)).div(usdc(1));
      await oracleAdapterMock.mock.getTvl.returns(tvl);
      const expectedMintAmount = totalSupply.div(2);
      mintAmount = await mApt.testCalculateDelta(usdcAmount, usdcEthPrice, "6");
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate pool amount with 1 pool", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      const usdcAmount = usdc(107);
      const tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await oracleAdapterMock.mock.getTvl.returns(tvl);

      const totalSupply = tokenAmountToBigNumber(21);
      await mApt.testMint(anotherUser.address, totalSupply);

      let poolAmount = await mApt.calculatePoolAmount(
        totalSupply,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(usdcAmount);

      const mAptAmount = tokenAmountToBigNumber(5);
      const expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      const expectedPoolAmount = expectedPoolValue
        .mul(usdc(1))
        .div(usdcEthPrice);
      poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);
    });

    it("Calculate pool amount with 2 pools", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      const daiEthPrice = tokenAmountToBigNumber("1603100000000000");
      const usdcAmount = usdc(107);
      const daiAmount = dai(10);
      const usdcValue = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      const daiValue = daiEthPrice.mul(daiAmount).div(dai(1));
      const tvl = usdcValue.add(daiValue);
      await oracleAdapterMock.mock.getTvl.returns(tvl);

      const totalSupply = tokenAmountToBigNumber(21);
      let mAptAmount = tokenAmountToBigNumber(10);
      let expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      let expectedPoolAmount = expectedPoolValue.mul(usdc(1)).div(usdcEthPrice);
      await mApt.testMint(anotherUser.address, totalSupply);
      let poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        usdcEthPrice,
        "6"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);

      mAptAmount = totalSupply.sub(mAptAmount);
      expectedPoolValue = tvl.mul(mAptAmount).div(totalSupply);
      expectedPoolAmount = expectedPoolValue.mul(dai(1)).div(daiEthPrice);
      poolAmount = await mApt.calculatePoolAmount(
        mAptAmount,
        daiEthPrice,
        "18"
      );
      expect(poolAmount).to.be.equal(expectedPoolAmount);
    });
  });

  describe("getTvl", () => {
    it("Call delegates to oracle adapter's getTvl", async () => {
      const usdTvl = tokenAmountToBigNumber("25100123.87654321", "8");
      await oracleAdapterMock.mock.getTvl.returns(usdTvl);
      expect(await mApt.testGetTvl()).to.equal(usdTvl);
    });

    it("getTvl reverts with same reason as oracle adapter", async () => {
      await oracleAdapterMock.mock.getTvl.revertsWithReason("SOMETHING_WRONG");
      await expect(mApt.testGetTvl()).to.be.revertedWith("SOMETHING_WRONG");
    });
  });
  describe("emergencyFundLp", () => {
    it("Emergency Safe can call", async () => {
      await expect(mApt.connect(emergencySafe).emergencyFundLp([], [])).to.not
        .be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      await expect(
        mApt.connect(randomUser).emergencyFundLp([], [])
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Revert on unregistered LP Safe address", async () => {
      await addressRegistryMock.mock.lpSafeAddress.returns(ZERO_ADDRESS);
      await expect(
        mApt.connect(emergencySafe).emergencyFundLp([], [])
      ).to.be.revertedWith("INVALID_LP_SAFE");
    });
  });

  describe("emergencyWithdrawLp", () => {
    it("Emergency Safe can call", async () => {
      await expect(mApt.connect(emergencySafe).emergencyWithdrawLp([], [])).to
        .not.be.reverted;
    });

    it("Unpermissioned cannot call", async () => {
      await expect(
        mApt.connect(randomUser).emergencyWithdrawLp([], [])
      ).to.be.revertedWith("NOT_EMERGENCY_ROLE");
    });

    it("Revert on unregistered LP Safe address", async () => {
      await addressRegistryMock.mock.lpSafeAddress.returns(ZERO_ADDRESS);
      await expect(
        mApt.connect(emergencySafe).emergencyWithdrawLp([], [])
      ).to.be.revertedWith("INVALID_LP_SAFE");
    });
  });
});
