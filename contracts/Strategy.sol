// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interface/IStrategy.sol";
import "./interface/IVault.sol";
import "./interface/IWeth.sol";
import "./interface/stakehouse/IGiantPoolBase.sol";
import "./interface/stakehouse/IGiantSavETHVaultPool.sol";
import "./interface/stakehouse/IGiantMevAndFeesPool.sol";
import "./interface/uniswapV3/IV3SwapRouter.sol";

contract Strategy is IStrategy, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event DepositETH(address pool, uint256 ethAmount);
    event WithdrawETH(address pool, uint256 ethAmount);
    event WithdrawDETH(uint256 dETHAmount);
    event SellDETH(uint256 dETHAmount, uint256 ethAmount);
    event ClaimRewards(uint256 ethAmount);

    IGiantSavETHVaultPool public immutable giantProtectedStakingPool;
    IGiantMevAndFeesPool public immutable giantFeesAndMevPool;
    IERC20 public immutable dETH;
    IWeth public immutable wETH;
    IV3SwapRouter public immutable uniswapV3Router;
    address public immutable vault;

    address public manager;
    uint24 public dEthUniswapV3PoolFee;

    receive() external payable {}

    constructor(
        address _vault,
        address _manager,
        address _giantProtectedStakingPool,
        address _giantFeesAndMevPool,
        address _dETH,
        address _wETH,
        address _uniswapV3Router,
        uint24 _dEthUniswapV3PoolFee
    ) Ownable() ReentrancyGuard() {
        vault = _vault;
        manager = _manager;
        giantProtectedStakingPool = IGiantSavETHVaultPool(
            _giantProtectedStakingPool
        );
        giantFeesAndMevPool = IGiantMevAndFeesPool(_giantFeesAndMevPool);
        dETH = IERC20(_dETH);
        wETH = IWeth(_wETH);
        uniswapV3Router = IV3SwapRouter(_uniswapV3Router);
        dEthUniswapV3PoolFee = _dEthUniswapV3PoolFee;
    }

    /**
     * @dev Update manager address
     */
    function updateManager(address _manager) external onlyOwner {
        manager = _manager;
    }

    /**
     * @dev Total ETH balance owned by strategy
     */
    function totalETH() public view returns (uint256) {
        return
            address(this).balance +
            IERC20(giantProtectedStakingPool.lpTokenETH()).balanceOf(
                address(this)
            ) +
            IERC20(giantFeesAndMevPool.lpTokenETH()).balanceOf(address(this));
    }

    /// pool manage logic

    /**
     * @dev Update Fee of DETH/ETH Uniswap V3 Pool (this is used to swap DETH to ETH)
     */
    function updateDEthUniswapV3PoolFee(uint24 _dEthUniswapV3PoolFee) external {
        require(msg.sender == manager, "unauthorized");
        dEthUniswapV3PoolFee = _dEthUniswapV3PoolFee;
    }

    /**
     * @dev deposit ETH into giant Pools (called by manager)
     */
    function depositETH(address pool, uint256 amount) external {
        require(msg.sender == manager, "unauthorized");
        require(
            pool == address(giantProtectedStakingPool) ||
                pool == address(giantFeesAndMevPool),
            "invalid pool"
        );

        IGiantPoolBase(pool).depositETH{value: amount}(amount);

        emit DepositETH(pool, amount);
    }

    /**
     * @dev withdraw ETH from giant Pools (called by manager)
     */
    function withdrawETH(address pool, uint256 amount) external {
        require(msg.sender == manager, "unauthorized");
        require(
            pool == address(giantProtectedStakingPool) ||
                pool == address(giantFeesAndMevPool),
            "invalid pool"
        );

        IGiantPoolBase(pool).withdrawETH(amount);

        emit WithdrawETH(pool, amount);
    }

    /**
     * @dev withdraw DETH from sav ETH vaults (called by manager)
     */
    function withdrawDETH(
        address[] calldata _savETHVaults,
        address[][] calldata _lpTokens,
        uint256[][] calldata _amounts,
        bool sell
    ) external {
        require(msg.sender == manager, "unauthorized");

        uint256 before = dETH.balanceOf(address(this));
        giantProtectedStakingPool.withdrawDETH(
            _savETHVaults,
            _lpTokens,
            _amounts
        );
        uint256 amount = dETH.balanceOf(address(this)) - before;

        emit WithdrawDETH(amount);

        if (sell) {
            sellDETH(amount);
        }
    }

    /**
     * @dev Sell DETH via uniswap v3 (called by manager)
     */
    function sellDETH(uint256 amount) public {
        require(msg.sender == manager, "unauthorized");

        dETH.safeApprove(address(uniswapV3Router), amount);

        IV3SwapRouter.ExactInputSingleParams memory params;
        params.tokenIn = address(dETH);
        params.tokenOut = address(wETH);
        params.fee = dEthUniswapV3PoolFee;
        params.recipient = address(this);
        params.deadline = type(uint256).max;
        params.amountIn = amount;
        params.amountOutMinimum = 0;
        params.sqrtPriceLimitX96 = 0;
        uint256 amountOut = uniswapV3Router.exactInputSingle(params);
        wETH.withdraw(amountOut);

        emit SellDETH(amount, amountOut);
    }

    /**
     * @dev Claim rewards from Giant fees and mev pool (called by manager)
     */
    function claimRewards(
        address[] calldata _stakingFundsVaults,
        bytes[][] calldata _blsPublicKeysForKnots
    ) external {
        require(msg.sender == manager, "unauthorized");

        uint256 before = address(this).balance;
        giantFeesAndMevPool.claimRewards(
            address(this),
            _stakingFundsVaults,
            _blsPublicKeysForKnots
        );
        uint256 amount = address(this).balance - before;

        emit ClaimRewards(amount);
    }

    /// manager excess profit logic

    /**
     * @dev manager profit - excess profit
     */
    function managerProfit() public view returns (uint256) {
        return totalETH() - IVault(vault).totalAssets();
    }

    /**
     * @dev withdraw manger profit (called by manager)
     */
    function withdrawManagerProfit() external {
        require(msg.sender == manager, "unauthorized");
        // no need to withdraw from pools, because it's called by manager
        (bool sent, ) = payable(manager).call{value: managerProfit()}("");
        require(sent, "failed to send eth");
    }

    /// user withdraw logic

    /**
     * @dev Withdraw ETH to user (called by vault)
     */
    function withdraw(address user, uint256 amount) external override {
        require(msg.sender == vault, "unauthorized");

        _prepareETH(amount);

        (bool sent, ) = payable(user).call{value: amount}("");
        require(sent, "failed to send eth");
    }

    /**
     * @dev Prepare ETH - withdraw from Giant Pools if strategy doesn't have enough ETH
     */
    function _prepareETH(uint256 amount) internal {
        uint256 balance = address(this).balance;
        if (balance > amount) {
            return;
        }

        amount -= balance;

        // try remaining withdraw from protected staking pool
        uint256 protectedStakingBalance = IERC20(
            giantProtectedStakingPool.lpTokenETH()
        ).balanceOf(address(this));
        if (protectedStakingBalance >= amount) {
            giantProtectedStakingPool.withdrawETH(amount);
            return;
        }
        giantProtectedStakingPool.withdrawETH(protectedStakingBalance);

        amount -= protectedStakingBalance;
        // try remaining withdraw from protected staking pool
        uint256 feesAndMevPoolBalance = IERC20(giantFeesAndMevPool.lpTokenETH())
            .balanceOf(address(this));
        if (feesAndMevPoolBalance >= amount) {
            giantFeesAndMevPool.withdrawETH(amount);
            return;
        }

        revert("insufficient fund");
    }
}
