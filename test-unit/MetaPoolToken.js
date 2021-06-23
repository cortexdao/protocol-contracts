const { expect } = require("chai");
const { ethers, web3, artifacts, waffle } = require("hardhat");
const timeMachine = require("ganache-time-traveler");
const { AddressZero: ZERO_ADDRESS } = ethers.constants;
const {
  FAKE_ADDRESS,
  ANOTHER_FAKE_ADDRESS,
  tokenAmountToBigNumber,
} = require("../utils/helpers");
const { deployMockContract } = waffle;
const OracleAdapter = artifacts.require("OracleAdapter");

const DUMMY_ADDRESS = web3.utils.toChecksumAddress(
  "0xCAFECAFECAFECAFECAFECAFECAFECAFECAFECAFE"
);

const usdc = (amount) => tokenAmountToBigNumber(amount, "6");
const dai = (amount) => tokenAmountToBigNumber(amount, "18");
const ether = (amount) => tokenAmountToBigNumber(amount, "18");

describe("Contract: MetaPoolToken", () => {
  // signers
  let deployer;
  let manager;
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
    [deployer, manager, randomUser, anotherUser] = await ethers.getSigners();

    ProxyAdmin = await ethers.getContractFactory("ProxyAdmin");
    MetaPoolTokenProxy = await ethers.getContractFactory("MetaPoolTokenProxy");
    MetaPoolToken = await ethers.getContractFactory("MetaPoolToken");

    // Mock out the pool manager and oracle adapter addresses
    // in the address registry.
    addressRegistryMock = await deployMockContract(
      deployer,
      artifacts.require("IAddressRegistryV2").abi
    );
    await addressRegistryMock.mock.poolManagerAddress.returns(manager.address);

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
    it("Owner is set to deployer", async () => {
      expect(await mApt.owner()).to.equal(deployer.address);
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

  describe("Set admin address", () => {
    it("Owner can set to valid address", async () => {
      await mApt.connect(deployer).setAdminAddress(randomUser.address);
      expect(await mApt.proxyAdmin()).to.equal(randomUser.address);
    });

    it("Revert when non-owner attempts to set", async () => {
      await expect(
        mApt.connect(randomUser).setAdminAddress(FAKE_ADDRESS)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Cannot set to zero address", async () => {
      await expect(
        mApt.connect(deployer).setAdminAddress(ZERO_ADDRESS)
      ).to.be.revertedWith("INVALID_ADMIN");
    });
  });

  describe("Minting and burning", () => {
    it("Manager can mint", async () => {
      const mintAmount = tokenAmountToBigNumber("100");
      await expect(mApt.connect(manager).mint(randomUser.address, mintAmount))
        .to.not.be.reverted;

      expect(await mApt.balanceOf(randomUser.address)).to.equal(mintAmount);
    });

    it("Manager can burn", async () => {
      const mintAmount = tokenAmountToBigNumber("100");
      const burnAmount = tokenAmountToBigNumber("90");
      await mApt.connect(manager).mint(randomUser.address, mintAmount);
      await expect(mApt.connect(manager).burn(randomUser.address, burnAmount))
        .to.not.be.reverted;

      expect(await mApt.balanceOf(randomUser.address)).to.equal(
        mintAmount.sub(burnAmount)
      );
    });

    it("Revert when non-manager attempts to mint", async () => {
      await expect(
        mApt
          .connect(randomUser)
          .mint(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
      await expect(
        mApt
          .connect(deployer)
          .mint(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
    });

    it("Revert when non-manager attempts to burn", async () => {
      await expect(
        mApt
          .connect(randomUser)
          .burn(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
      await expect(
        mApt
          .connect(deployer)
          .mint(anotherUser.address, tokenAmountToBigNumber("1"))
      ).to.be.revertedWith("MANAGER_ONLY");
    });

    it("Revert when minting zero", async () => {
      await expect(
        mApt.connect(manager).mint(randomUser.address, 0)
      ).to.be.revertedWith("INVALID_MINT_AMOUNT");
    });

    it("Revert when burning zero", async () => {
      await expect(
        mApt.connect(manager).burn(randomUser.address, 0)
      ).to.be.revertedWith("INVALID_BURN_AMOUNT");
    });
  });

  describe("getDeployedValue", () => {
    it("Return 0 if zero mAPT supply", async () => {
      expect(await mApt.totalSupply()).to.equal("0");
      expect(await mApt.getDeployedValue(FAKE_ADDRESS)).to.equal("0");
    });

    it("Return 0 if zero mAPT balance", async () => {
      await mApt
        .connect(manager)
        .mint(FAKE_ADDRESS, tokenAmountToBigNumber(1000));
      expect(await mApt.getDeployedValue(ANOTHER_FAKE_ADDRESS)).to.equal(0);
    });

    it("Returns calculated value for non-zero mAPT balance", async () => {
      const tvl = ether("502300");
      const balance = tokenAmountToBigNumber("1000");
      const anotherBalance = tokenAmountToBigNumber("12345");
      const totalSupply = balance.add(anotherBalance);

      await oracleAdapterMock.mock.getTvl.returns(tvl);
      await mApt.connect(manager).mint(FAKE_ADDRESS, balance);
      await mApt.connect(manager).mint(ANOTHER_FAKE_ADDRESS, anotherBalance);

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

      await mApt
        .connect(manager)
        .mint(anotherUser.address, tokenAmountToBigNumber(100));

      const mintAmount = await mApt.calculateMintAmount(
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

      const mintAmount = await mApt.calculateMintAmount(
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
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);

      let mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      expect(mintAmount).to.be.equal(totalSupply);

      tvl = usdcEthPrice.mul(usdcAmount.mul(2)).div(usdc(1));
      await oracleAdapterMock.mock.getTvl.returns(tvl);
      const expectedMintAmount = totalSupply.div(2);
      mintAmount = await mApt.calculateMintAmount(
        usdcAmount,
        usdcEthPrice,
        "6"
      );
      expect(mintAmount).to.be.equal(expectedMintAmount);
    });

    it("Calculate pool amount with 1 pool", async () => {
      const usdcEthPrice = tokenAmountToBigNumber("1602950450000000");
      const usdcAmount = usdc(107);
      const tvl = usdcEthPrice.mul(usdcAmount).div(usdc(1));
      await oracleAdapterMock.mock.getTvl.returns(tvl);

      const totalSupply = tokenAmountToBigNumber(21);
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);

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
      await mApt.connect(manager).mint(anotherUser.address, totalSupply);
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
      expect(await mApt.getTvl()).to.equal(usdTvl);
    });

    it("getTvl reverts with same reason as oracle adapter", async () => {
      await oracleAdapterMock.mock.getTvl.revertsWithReason("SOMETHING_WRONG");
      await expect(mApt.getTvl()).to.be.revertedWith("SOMETHING_WRONG");
    });
  });
});
