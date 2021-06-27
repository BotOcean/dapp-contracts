// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
import "./../fund/FundLogic.sol";
import "./../interfaces/IERC20.sol";
import "./../utils/Address.sol";

contract CrazyArb {
    using Address for address;

    function arb(address asset, address vault) external {
        uint256 _myBal = IERC20(asset).balanceOf(address(this));
        IERC20(asset).approve(vault, _myBal);

        FundLogic(vault).deposit(_myBal);

        uint256 _myShares = FundLogic(vault).balanceOf(address(this));

        FundLogic(vault).withdraw(_myShares);
    }
}