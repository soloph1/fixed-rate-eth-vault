import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Vault, IERC20, Strategy } from "../types";

const GIANT_PROTECTED_STAKING_POOL = "0xb0AD9Da3b4962D94386FdeaE32340a0A8E58f8d1";
const GIANT_FEES_AND_MEV_POOL = "0x611beA2dB2BA155C04FE47723D91A3Dc0f52Fbe1";
const DETH = "0x506c2b850d519065a4005b04b9ceed946a64cb6f";
const WETH = "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6"
const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"
const DETH_WETH_UNISWAP_V3_POOL_FEE = 500;

describe("Strategy Test", () => {
  let snapId: string;
  let manager: SignerWithAddress, user1: SignerWithAddress, user2: SignerWithAddress;
  let vault: Vault;
  let strategy: Strategy;
  let dETH: IERC20;

  const amount = ethers.utils.parseEther("1");

  beforeEach(async () => {
    snapId = (await network.provider.request({
      method: "evm_snapshot",
      params: [],
    })) as string;
    await ethers.provider.send("evm_mine", []);

    [, manager, user1, user2] = await ethers.getSigners();

    dETH = <IERC20>await ethers.getContractAt("IERC20", DETH)

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

    await vault.setStrategy(strategy.address);
    await vault.connect(user1).deposit(amount, { value: amount });
    await vault.connect(user2).deposit(amount.mul(2), { value: amount.mul(2) });
  })

  afterEach(async () => {
    await network.provider.request({
      method: "evm_revert",
      params: [snapId],
    });
    await ethers.provider.send("evm_mine", []);
  })

  it("depositETH", async () => {
    // check manager authorized
    await expect(strategy.depositETH(GIANT_PROTECTED_STAKING_POOL, amount.mul(2))).to.revertedWith('unauthorized');
    // check invalid pool
    await expect(strategy.connect(manager).depositETH(UNISWAP_V3_ROUTER, amount.mul(2))).to.revertedWith('invalid pool');

    const totalETHBefore = await strategy.totalETH();
    await strategy.connect(manager).depositETH(GIANT_PROTECTED_STAKING_POOL, amount.mul(2));
    expect(await strategy.totalETH()).to.equal(totalETHBefore);

    await strategy.connect(manager).depositETH(GIANT_FEES_AND_MEV_POOL, amount);
    expect(await strategy.totalETH()).to.equal(totalETHBefore);
  })

  it("withdrawETH", async () => {

    const totalETHBefore = await strategy.totalETH();
    await strategy.connect(manager).depositETH(GIANT_PROTECTED_STAKING_POOL, amount.mul(2));
    await strategy.connect(manager).depositETH(GIANT_FEES_AND_MEV_POOL, amount);

    // check manager authorized
    await expect(strategy.withdrawETH(GIANT_PROTECTED_STAKING_POOL, amount.mul(2))).to.revertedWith('unauthorized');
    // check invalid pool
    await expect(strategy.connect(manager).withdrawETH(UNISWAP_V3_ROUTER, amount.mul(2))).to.revertedWith('invalid pool');

    await strategy.connect(manager).withdrawETH(GIANT_PROTECTED_STAKING_POOL, amount);
    expect(await strategy.totalETH()).to.equal(totalETHBefore);

    await strategy.connect(manager).withdrawETH(GIANT_FEES_AND_MEV_POOL, amount);
    expect(await strategy.totalETH()).to.equal(totalETHBefore);
  })

  it("withdrawDETH", async () => {
    const totalETHBefore = await strategy.totalETH();
    await strategy.connect(manager).depositETH(GIANT_PROTECTED_STAKING_POOL, amount.mul(2));
    await strategy.connect(manager).depositETH(GIANT_FEES_AND_MEV_POOL, amount);

    await network.provider.send("evm_increaseTime", [365 * 86400]);
    await network.provider.send("evm_mine");

    const withdrawAmount = ethers.utils.parseEther("0.1");

    // check manager authorized
    await expect(strategy.withdrawDETH(
      ["0xEAFc277DB99360e542910f2B80D96B32Bcd6c436"],
      [["0x9d45b755AE7B78D23746BcbABdBAb2ac430cf377"]],
      [[withdrawAmount]],
      false,
    )).to.revertedWith('unauthorized');

    // manager can withdraw DETH
    await strategy.connect(manager).withdrawDETH(
      ["0xEAFc277DB99360e542910f2B80D96B32Bcd6c436"],
      [["0x9d45b755AE7B78D23746BcbABdBAb2ac430cf377"]],
      [[withdrawAmount]],
      false
    );

    expect(await dETH.balanceOf(strategy.address)).to.gte(withdrawAmount)
    expect(await strategy.totalETH()).to.lt(totalETHBefore);
  })

  it("withdrawDETH & SellDETH in one transaction", async () => {
    const totalETHBefore = await strategy.totalETH();
    await strategy.connect(manager).depositETH(GIANT_PROTECTED_STAKING_POOL, amount.mul(2));
    await strategy.connect(manager).depositETH(GIANT_FEES_AND_MEV_POOL, amount);

    await network.provider.send("evm_increaseTime", [365 * 86400]);
    await network.provider.send("evm_mine");

    const withdrawAmount = ethers.utils.parseEther("0.1");

    // check manager authorized
    await expect(strategy.withdrawDETH(
      ["0xEAFc277DB99360e542910f2B80D96B32Bcd6c436"],
      [["0x9d45b755AE7B78D23746BcbABdBAb2ac430cf377"]],
      [[withdrawAmount]],
      true,
    )).to.revertedWith('unauthorized');

    // manager can withdraw DETH & Sell
    await strategy.connect(manager).withdrawDETH(
      ["0xEAFc277DB99360e542910f2B80D96B32Bcd6c436"],
      [["0x9d45b755AE7B78D23746BcbABdBAb2ac430cf377"]],
      [[withdrawAmount]],
      true,
    );

    expect(await dETH.balanceOf(strategy.address)).to.equal(0)

    // consider the slippage via uniswap v3
    expect(await strategy.totalETH()).to.gt(totalETHBefore.sub(withdrawAmount));
  })

  it("withdrawDETH & SellDETH in two transaction", async () => {
    const totalETHBefore = await strategy.totalETH();
    await strategy.connect(manager).depositETH(GIANT_PROTECTED_STAKING_POOL, amount.mul(2));
    await strategy.connect(manager).depositETH(GIANT_FEES_AND_MEV_POOL, amount);

    await network.provider.send("evm_increaseTime", [365 * 86400]);
    await network.provider.send("evm_mine");

    const withdrawAmount = ethers.utils.parseEther("0.1");
    await strategy.connect(manager).withdrawDETH(
      ["0xEAFc277DB99360e542910f2B80D96B32Bcd6c436"],
      [["0x9d45b755AE7B78D23746BcbABdBAb2ac430cf377"]],
      [[withdrawAmount]],
      false,
    );

    const balance = await dETH.balanceOf(strategy.address);

    // check manager authorized
    await expect(strategy.sellDETH(balance)).to.revertedWith('unauthorized');

    // manager can sell DETH
    await strategy.connect(manager).sellDETH(balance);

    expect(await dETH.balanceOf(strategy.address)).to.equal(0)

    // consider the slippage via uniswap v3
    expect(await strategy.totalETH()).to.gt(totalETHBefore.sub(withdrawAmount));
  })

  it("claimRewards", async () => {
    const totalETHBefore = await strategy.totalETH();
    await strategy.connect(manager).depositETH(GIANT_PROTECTED_STAKING_POOL, amount.mul(2));
    await strategy.connect(manager).depositETH(GIANT_FEES_AND_MEV_POOL, amount);

    await network.provider.send("evm_increaseTime", [365 * 86400]);
    await network.provider.send("evm_mine");

    // check manager authorized
    await expect(strategy.claimRewards(
      ["0xF8c9720A183E4872F388D2499469f506CaD69a0C"],
      [["0x8dc1b3f45219691fcbca15e6e35f47d01249c0f25c6e1fb1c3f0be95dbbdaf6460276a89840b80925572bf339928f919"]],
    )).to.revertedWith('unauthorized');

    // manager can claim rewards
    await strategy.connect(manager).claimRewards(
      ["0xF8c9720A183E4872F388D2499469f506CaD69a0C"],
      [["0x8dc1b3f45219691fcbca15e6e35f47d01249c0f25c6e1fb1c3f0be95dbbdaf6460276a89840b80925572bf339928f919"]],
    );

    expect(await strategy.totalETH()).to.gte(totalETHBefore);
  })

  it("withdrawManagerProfit", async () => {
    const balanceBefore = await manager.getBalance()

    await network.provider.send("evm_increaseTime", [365 * 86400]);
    await network.provider.send("evm_mine");
    // charge eth for testing
    await user1.sendTransaction({
      to: strategy.address,
      value: amount
    });

    // check manager authorized
    await expect(strategy.withdrawManagerProfit()).to.revertedWith('unauthorized');

    // manager can withdraw profit
    await strategy.connect(manager).withdrawManagerProfit();

    // manager balance increased
    expect(await manager.getBalance()).to.gt(balanceBefore);

    // no excess profit
    expect(await vault.totalAssets()).to.equal(await strategy.totalETH());
    expect(await strategy.managerProfit()).to.equal(0);
  })

  describe("withdraw", () => {
    it("withdraw authorization", async () => {
      await expect(strategy.connect(manager).withdraw(manager.address, amount)).to.revertedWith('unauthorized');
    })

    it("withdraw from eth available in strategy", async () => {
      await strategy.connect(manager).depositETH(GIANT_PROTECTED_STAKING_POOL, amount);
      await strategy.connect(manager).depositETH(GIANT_FEES_AND_MEV_POOL, amount);

      await vault.connect(user1).withdraw(amount);
    })

    it("withdraw from giantProtectedStakingPool if eth not avaialble in strategy", async () => {
      await strategy.connect(manager).depositETH(GIANT_PROTECTED_STAKING_POOL, amount);
      await strategy.connect(manager).depositETH(GIANT_FEES_AND_MEV_POOL, amount.mul(2));

      await vault.connect(user1).withdraw(amount);
    })

    it("withdraw from both giantProtectedStakingPool & feesAndMevPool if eth not avaialble in strategy", async () => {
      await strategy.connect(manager).depositETH(GIANT_FEES_AND_MEV_POOL, amount.mul(3));

      await vault.connect(user1).withdraw(amount);
    })

    it("can't withdraw when insufficient fund", async () => {
      await strategy.connect(manager).depositETH(GIANT_PROTECTED_STAKING_POOL, amount.div(2));

      await network.provider.send("hardhat_setBalance", [
        strategy.address,
        '0x1000',
      ]);
      await network.provider.send("evm_mine");

      await expect(vault.connect(user1).withdraw(amount)).to.revertedWith('insufficient fund');
    })
  })
});
