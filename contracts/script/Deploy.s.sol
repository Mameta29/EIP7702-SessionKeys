// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/SessionKeyManager.sol";

contract DeployScript is Script {
    function run() external {
        // コマンドラインから --private-key で渡される
        vm.startBroadcast();
        
        SessionKeyManager manager = new SessionKeyManager();
        console.log("SessionKeyManager deployed at:", address(manager));
        
        vm.stopBroadcast();
    }
}

