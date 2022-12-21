// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface IGiantPoolBase {
    function lpTokenETH() external view returns (address);

    function depositETH(uint256 _amount) external payable;

    function withdrawETH(uint256 _amount) external;
}
