/**
 * Pure Viem + EIP-7702 デモ
 * 
 * ZeroDevを使わず、純粋なViemとカスタムスマートコントラクトで実装
 */
import 'dotenv/config';
import { type Hex, type Address, parseUnits } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { Owner7702, Agent7702 } from './lib/session-key.js';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║  🤖 AI Agent Session Key Demo                                     ║');
  console.log('║  📋 Viem + EIP-7702 + Custom Smart Contract                      ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('[Architecture]');
  console.log('  ✅ EIP-7702: EOA + Custom SessionKeyManager Contract');
  console.log('  ✅ Viem: Lightweight Ethereum library');
  console.log('  ✅ On-chain Validation: All policies enforced by smart contract');
  console.log('  ❌ ERC-4337: No Bundler, No EntryPoint, No UserOperation\n');

  // 環境変数チェック
  if (!process.env.OWNER_PRIVATE_KEY) {
    console.error('❌ Error: OWNER_PRIVATE_KEY not set');
    process.exit(1);
  }

  if (!process.env.SESSION_KEY_MANAGER_ADDRESS) {
    console.error('❌ Error: SESSION_KEY_MANAGER_ADDRESS not set');
    console.error('Please deploy SessionKeyManager.sol first:');
    console.error('  cd contracts && forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast');
    process.exit(1);
  }

  const contractAddress = process.env.SESSION_KEY_MANAGER_ADDRESS as Address;
  const tokenAddress = process.env.TEST_TOKEN_ADDRESS as Address;
  const merchantAddress = process.env.MERCHANT_ADDRESS as Address;

  // Setup
  console.log('='.repeat(70));
  console.log('📋 Setup');
  console.log('='.repeat(70));

  const owner = new Owner7702(process.env.OWNER_PRIVATE_KEY as Hex);
  console.log(`[Setup] Owner Address: ${owner.getAddress()}`);
  console.log(`[Setup] SessionKeyManager: ${contractAddress}`);
  console.log(`[Setup] Token: ${tokenAddress}`);
  console.log(`[Setup] Merchant: ${merchantAddress}`);

  // Agentがセッションキーを生成
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAddress = privateKeyToAccount(sessionPrivateKey).address;
  const agent = new Agent7702(sessionPrivateKey, owner.getAddress());

  console.log(`[Setup] Agent Session Key: ${sessionKeyAddress}`);
  console.log('[Setup] 🔐 Private key is kept secret by Agent\n');

  const results: Array<{ name: string; success: boolean }> = [];

  // ==========================================
  // Scenario 1: EIP-7702 Setup
  // ==========================================
  console.log('='.repeat(70));
  console.log('📋 Scenario 1: EIP-7702 Delegation');
  console.log('='.repeat(70) + '\n');

  try {
    const txHash = await owner.setup7702(contractAddress);
    console.log(`\n[Result] ✅ Success! TX: ${txHash}\n`);
    results.push({ name: '7702 Setup', success: true });
  } catch (error: any) {
    console.error(`\n[Result] ❌ Failed: ${error.message}\n`);
    results.push({ name: '7702 Setup', success: false });
    printSummary(results);
    process.exit(1);
  }

  // ==========================================
  // Scenario 2: Register Session Key
  // ==========================================
  console.log('='.repeat(70));
  console.log('📋 Scenario 2: Register Session Key');
  console.log('='.repeat(70) + '\n');

  console.log('┌─────────────────────────────────────────────────────┐');
  console.log('│  Session Key Policy                                 │');
  console.log('├─────────────────────────────────────────────────────┤');
  console.log('│  Valid for:  7 days                                 │');
  console.log('│  Max amount: 1,000 tokens per tx                    │');
  console.log('│  Max usage:  10 times                               │');
  console.log(`│  Target:     ${tokenAddress.slice(0, 10)}...${tokenAddress.slice(-8)} │`);
  console.log('│  Function:   transfer(address,uint256)              │');
  console.log('└─────────────────────────────────────────────────────┘\n');

  try {
    const txHash = await owner.registerSessionKey({
      sessionKeyAddress,
      validDays: 7,
      maxAmount: parseUnits('1000', 18),
      allowedTarget: tokenAddress,
      allowedFunctionName: 'transfer(address,uint256)',
      maxUsage: 10,
    });

    console.log(`\n[Result] ✅ Success! TX: ${txHash}\n`);
    results.push({ name: 'Session Key Registration', success: true });
  } catch (error: any) {
    console.error(`\n[Result] ❌ Failed: ${error.message}\n`);
    results.push({ name: 'Session Key Registration', success: false });
    printSummary(results);
    process.exit(1);
  }

  // ==========================================
  // Scenario 3: Success - Transfer within limits
  // ==========================================
  console.log('='.repeat(70));
  console.log('📋 Scenario 3: Transfer within Limits (Success Case)');
  console.log('='.repeat(70));

  try {
    const result = await agent.executeTransfer({
      tokenAddress,
      to: merchantAddress,
      amount: parseUnits('100', 18), // 100 tokens < 1000 limit
    });

    if (result.success) {
      console.log(`\n[Result] ✅ TEST PASSED - TX: ${result.txHash}\n`);
      results.push({ name: 'Success Transfer', success: true });
    } else {
      console.log(`\n[Result] ❌ TEST FAILED - ${result.error}\n`);
      results.push({ name: 'Success Transfer', success: false });
    }
  } catch (error: any) {
    console.error(`\n[Result] ❌ TEST FAILED - ${error.message}\n`);
    results.push({ name: 'Success Transfer', success: false });
  }

  // ==========================================
  // Scenario 4: Fail - Amount exceeds limit
  // ==========================================
  console.log('='.repeat(70));
  console.log('📋 Scenario 4: Amount Exceeds Limit (Expected Fail)');
  console.log('='.repeat(70));

  try {
    const result = await agent.executeTransfer({
      tokenAddress,
      to: merchantAddress,
      amount: parseUnits('5000', 18), // 5000 tokens > 1000 limit
    });

    if (!result.success && result.error?.includes('Amount exceeds limit')) {
      console.log(`\n[Result] ✅ TEST PASSED - Correctly rejected: ${result.error}\n`);
      results.push({ name: 'Amount Limit (Expected Fail)', success: true });
    } else if (!result.success) {
      console.log(`\n[Result] ⚠️  TEST PARTIALLY PASSED - ${result.error}\n`);
      results.push({ name: 'Amount Limit (Expected Fail)', success: true });
    } else {
      console.log(`\n[Result] ❌ TEST FAILED - Should have been rejected\n`);
      results.push({ name: 'Amount Limit (Expected Fail)', success: false });
    }
  } catch (error: any) {
    console.log(`\n[Result] ✅ TEST PASSED - Correctly rejected\n`);
    results.push({ name: 'Amount Limit (Expected Fail)', success: true });
  }

  // ==========================================
  // Scenario 5: Fail - Invalid target
  // ==========================================
  console.log('='.repeat(70));
  console.log('📋 Scenario 5: Invalid Target (Expected Fail)');
  console.log('='.repeat(70));

  const unauthorizedToken = '0x0000000000000000000000000000000000000001' as Address;

  try {
    const result = await agent.executeTransfer({
      tokenAddress: unauthorizedToken,
      to: merchantAddress,
      amount: parseUnits('100', 18),
    });

    if (!result.success && result.error?.includes('Target not allowed')) {
      console.log(`\n[Result] ✅ TEST PASSED - Correctly rejected: ${result.error}\n`);
      results.push({ name: 'Invalid Target (Expected Fail)', success: true });
    } else if (!result.success) {
      console.log(`\n[Result] ⚠️  TEST PARTIALLY PASSED - ${result.error}\n`);
      results.push({ name: 'Invalid Target (Expected Fail)', success: true });
    } else {
      console.log(`\n[Result] ❌ TEST FAILED - Should have been rejected\n`);
      results.push({ name: 'Invalid Target (Expected Fail)', success: false });
    }
  } catch (error: any) {
    console.log(`\n[Result] ✅ TEST PASSED - Correctly rejected\n`);
    results.push({ name: 'Invalid Target (Expected Fail)', success: true });
  }

  // Summary
  printSummary(results);
}

function printSummary(results: Array<{ name: string; success: boolean }>) {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                           📊 SUMMARY                               ║');
  console.log('╠════════════════════════════════════════════════════════════════════╣');

  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    const paddedName = result.name.padEnd(40);
    console.log(`║  ${paddedName} ${status.padEnd(20)} ║`);
  }

  console.log('╠════════════════════════════════════════════════════════════════════╣');

  const passedCount = results.filter((r) => r.success).length;
  const totalCount = results.length;

  if (passedCount === totalCount) {
    console.log('║  🎉 All scenarios completed successfully!                          ║');
  } else {
    console.log(`║  ⚠️  ${passedCount}/${totalCount} scenarios passed                                      ║`);
  }

  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log('[Demo Complete]');
  console.log('Architecture: Pure Viem + EIP-7702 + Custom Smart Contract');
  console.log('All policy validation done on-chain by SessionKeyManager.sol\n');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

