// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IVault {
    function totalAssets() external view returns (uint256 totalManagedAssets);
}
