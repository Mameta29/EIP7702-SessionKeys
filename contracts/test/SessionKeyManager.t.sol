// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/SessionKeyManager.sol";

contract SessionKeyManagerTest is Test {
    SessionKeyManager public manager;
    address public owner;
    address public sessionKey;
    address public target;
    
    function setUp() public {
        owner = address(this);
        sessionKey = address(0x1);
        target = address(0x2);
        manager = new SessionKeyManager();
    }
    
    function testRegisterSessionKey() public {
        uint256 validUntil = block.timestamp + 7 days;
        uint256 maxAmount = 1000 ether;
        bytes4 selector = bytes4(keccak256("transfer(address,uint256)"));
        uint256 maxUsage = 10;
        
        manager.registerSessionKey(
            sessionKey,
            validUntil,
            maxAmount,
            target,
            selector,
            maxUsage
        );
        
        SessionKeyManager.SessionKey memory sk = manager.getSessionKey(sessionKey);
        assertEq(sk.key, sessionKey);
        assertEq(sk.validUntil, validUntil);
        assertEq(sk.maxAmount, maxAmount);
        assertEq(sk.allowedTarget, target);
        assertEq(sk.allowedFunction, selector);
        assertEq(sk.usageCount, 0);
        assertEq(sk.maxUsage, maxUsage);
        assertTrue(sk.active);
    }
    
    function testRevokeSessionKey() public {
        uint256 validUntil = block.timestamp + 7 days;
        bytes4 selector = bytes4(keccak256("transfer(address,uint256)"));
        
        manager.registerSessionKey(
            sessionKey,
            validUntil,
            1000 ether,
            target,
            selector,
            10
        );
        
        manager.revokeSessionKey(sessionKey);
        
        SessionKeyManager.SessionKey memory sk = manager.getSessionKey(sessionKey);
        assertFalse(sk.active);
    }
    
    function testIsValidSessionKey() public {
        uint256 validUntil = block.timestamp + 7 days;
        bytes4 selector = bytes4(keccak256("transfer(address,uint256)"));
        
        manager.registerSessionKey(
            sessionKey,
            validUntil,
            1000 ether,
            target,
            selector,
            10
        );
        
        assertTrue(manager.isValidSessionKey(sessionKey));
    }
}

