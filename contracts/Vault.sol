// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./interface/IVault.sol";
import "./interface/IStrategy.sol";

contract Vault is IVault, Ownable, ERC20, ReentrancyGuard {
    event Deposit(address indexed user, uint256 assets, uint256 shares);
    event Withdraw(address indexed user, uint256 shares, uint256 assets);

    uint256 public constant DENOMINATOR = 1e18;
    uint256 public immutable startTime;

    uint256 public annualFixedRate;
    address public strategy;

    receive() external payable {}

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _annualFixedRate
    ) Ownable() ERC20(_name, _symbol) ReentrancyGuard() {
        annualFixedRate = _annualFixedRate;
        startTime = block.timestamp;
    }

    function updateAnnualFixedRate(uint256 _annualFixedRate)
        external
        onlyOwner
    {
        annualFixedRate = _annualFixedRate;
    }

    function setStrategy(address _strategy) external onlyOwner {
        require(_strategy != address(0), "zero address");
        strategy = _strategy;
    }

    /**
     * @dev Returns the current index of asset (this index increased by time based on the annual fixed rate)
     */
    function getCurrentIndex() public view returns (uint256) {
        return
            DENOMINATOR +
            (annualFixedRate * (block.timestamp - startTime)) /
            365 days;
    }

    /**
     * @dev Returns the total amount of the underlying asset for users (based on fixed rate, this will exclude the manager profit)
     */
    function totalAssets()
        public
        view
        override
        returns (uint256 totalManagedAssets)
    {
        return (totalSupply() * getCurrentIndex()) / DENOMINATOR;
    }

    /**
     * @dev Returns the amount of shares that the Vault would exchange for the amount of assets provided, in an ideal
     * scenario where all the conditions are met.
     */
    function convertToShares(uint256 assets)
        public
        view
        returns (uint256 shares)
    {
        uint256 _totalAssets = totalAssets();
        if (_totalAssets == 0) {
            return assets;
        }

        return (assets * totalSupply()) / _totalAssets;
    }

    /**
     * @dev Returns the amount of assets that the Vault would exchange for the amount of shares provided, in an ideal
     * scenario where all the conditions are met.
     */
    function convertToAssets(uint256 shares)
        public
        view
        returns (uint256 assets)
    {
        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            return shares;
        }

        return (shares * totalAssets()) / _totalSupply;
    }

    /**
     * @dev Deposit ETH
     */
    function deposit(uint256 assets) external payable returns (uint256 shares) {
        require(assets != 0 && assets == msg.value, "invalid amount");

        // calculate shares
        shares = convertToShares(assets);

        // strategy deposit
        (bool sent, ) = payable(strategy).call{value: assets}("");
        require(sent, "failed to send eth");

        // mint tokens
        _mint(msg.sender, shares);

        emit Deposit(msg.sender, assets, shares);
    }

    /**
     * @dev Withdraw Shares
     */
    function withdraw(uint256 shares) external {
        uint256 assets = convertToAssets(shares);

        _burn(msg.sender, shares);

        IStrategy(strategy).withdraw(msg.sender, assets);

        emit Withdraw(msg.sender, assets, shares);
    }
}
