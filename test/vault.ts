import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Vault, Strategy } from "../types";

const GIANT_PROTECTED_STAKING_POOL = "0xb0AD9Da3b4962D94386FdeaE32340a0A8E58f8d1";
const GIANT_FEES_AND_MEV_POOL = "0x611beA2dB2BA155C04FE47723D91A3Dc0f52Fbe1";
const DETH = "0x506c2b850d519065a4005b04b9ceed946a64cb6f";
const WETH = "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6"
const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"
const DETH_WETH_UNISWAP_V3_POOL_FEE = 500;

describe("Vault Test", () => {
  let snapId: string;
  let manager: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress;
  let vault: Vault;
  let strategy: Strategy;

  const amount = ethers.utils.parseEther("1");

  beforeEach(async () => {
    snapId = (await network.provider.request({
      method: "evm_snapshot",
      params: [],
    })) as string;
    await ethers.provider.send("evm_mine", []);

    [, manager, user1, user2] = await ethers.getSigners();

    const Vault = await ethers.getContractFactory('Vault');
    vault = <Vault>await Vault.deploy("Fixed ETH Vault", 'fETH', ethers.utils.parseUnits("5", 16)); // 5% APR

    const Strategy = await ethers.getContractFactory('Strategy');
    strategy = <Strategy>await Strategy.deploy(
      vault.address,
      manager.address,
      GIANT_PROTECTED_STAKING_POOL,
      GIANT_FEES_AND_MEV_POOL,
      DETH,
      WETH,
      UNISWAP_V3_ROUTER,
      DETH_WETH_UNISWAP_V3_POOL_FEE,
    );
  })

  afterEach(async () => {
    await network.provider.request({
      method: "evm_revert",
      params: [snapId],
    });
    await ethers.provider.send("evm_mine", []);
  })

  it("updateAnnualFixedRate", async () => {
    expect(await vault.annualFixedRate()).to.equal(ethers.utils.parseUnits("5", 16));

    // non-owner can't update annual fixed rate
    await expect(vault.connect(user1).updateAnnualFixedRate(ethers.utils.parseUnits("10", 16))).to.revertedWith('Ownable: caller is not the owner');

    // owner can update annual fixed rate
    await vault.updateAnnualFixedRate(ethers.utils.parseUnits("10", 16));
    expect(await vault.annualFixedRate()).to.equal(ethers.utils.parseUnits("10", 16));
  })

  it("setStrategy", async () => {
    expect(await vault.strategy()).to.equal(ethers.constants.AddressZero);

    // non-owner can't set strategy
    await expect(vault.connect(user1).setStrategy(strategy.address)).to.revertedWith('Ownable: caller is not the owner');

    // new strategy can't be zero
    await expect(vault.setStrategy(ethers.constants.AddressZero)).to.revertedWith('zero address');

    // owner can set strategy
    await vault.setStrategy(strategy.address);
    expect(await vault.strategy()).to.equal(strategy.address);
  })

  it("deposit", async () => {
    await vault.setStrategy(strategy.address);

    // check invalid amount
    await expect(vault.connect(user1).deposit(0, { value: amount })).to.revertedWith('invalid amount');
    await expect(vault.connect(user1).deposit(amount, { value: amount.add(1) })).to.revertedWith('invalid amount');

    const user1ExpectedDepositAmount = await vault.convertToShares(amount);
    await vault.connect(user1).deposit(amount, { value: amount });
    const user2ExpectedDepositAmount = await vault.convertToShares(amount.mul(2));
    await vault.connect(user2).deposit(amount.mul(2), { value: amount.mul(2) });

    expect(await vault.balanceOf(user1.address)).to.closeTo(user1ExpectedDepositAmount, 1e12);
    expect(await vault.balanceOf(user2.address)).to.closeTo(user2ExpectedDepositAmount, 1e12);
  })

  it("withdraw", async () => {
    await vault.setStrategy(strategy.address);

    await vault.connect(user1).deposit(amount, { value: amount });
    await vault.connect(user2).deposit(amount.mul(2), { value: amount.mul(2) });

    await network.provider.send("evm_increaseTime", [365 * 86400]);
    await network.provider.send("evm_mine");

    // charge eth to strategy for testing
    await user1.sendTransaction({
      to: strategy.address,
      value: amount
    });

    const user1BalanceBefore = await user1.getBalance();
    const user2BalanceBefore = await user2.getBalance();

    const user1ExpectedWithdrawAmount = await vault.convertToAssets(await vault.balanceOf(user1.address));
    await vault.connect(user1).withdraw(await vault.balanceOf(user1.address));
    const user2ExpectedWithdrawAmount = await vault.convertToAssets(await vault.balanceOf(user2.address));
    await vault.connect(user2).withdraw(await vault.balanceOf(user2.address));

    expect((await user1.getBalance()).sub(user1BalanceBefore)).to.closeTo(user1ExpectedWithdrawAmount, 1e12);
    expect((await user2.getBalance()).sub(user2BalanceBefore)).to.closeTo(user2ExpectedWithdrawAmount, 1e12);

    expect(await vault.balanceOf(user1.address)).to.equal(0);
    expect(await vault.balanceOf(user2.address)).to.equal(0);

    // no assets
    expect(await vault.convertToAssets(amount)).to.equal(amount);
    expect(await vault.convertToShares(amount)).to.equal(amount);
  })
});
