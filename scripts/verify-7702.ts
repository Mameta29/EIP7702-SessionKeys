import 'dotenv/config';
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.RPC_URL),
  });

  const ownerAddress = privateKeyToAccount(
    process.env.OWNER_PRIVATE_KEY as `0x${string}`
  ).address;

  console.log('EIP-7702 Delegation Verification');
  console.log('='.repeat(60));
  console.log(`Owner EOA: ${ownerAddress}\n`);

  // EOAのコードを取得
  const code = await publicClient.getCode({ address: ownerAddress });

  console.log('Code at Owner EOA:');
  console.log(`  Raw: ${code}`);
  console.log(`  Length: ${code ? code.length : 0} characters\n`);

  // EIP-7702のプリフィックスチェック
  if (code && code.startsWith('0xef01')) {
    console.log('Status: Delegated (EIP-7702)');
    console.log('  Prefix: 0xef01 (EIP-7702 delegation prefix)');
    
    // 委譲先アドレスを抽出（プリフィックス後の20バイト）
    if (code.length >= 46) { // 0x + ef01 + 20バイト（40文字）= 46文字
      const delegatedAddress = '0x' + code.slice(6, 46);
      console.log(`  Delegated to: ${delegatedAddress}`);
      console.log(`  Expected: ${process.env.SESSION_KEY_MANAGER_ADDRESS}`);
      
      if (delegatedAddress.toLowerCase() === process.env.SESSION_KEY_MANAGER_ADDRESS?.toLowerCase()) {
        console.log('\n  Verification: PASS');
      } else {
        console.log('\n  Verification: MISMATCH');
      }
    }
  } else if (code && code !== '0x') {
    console.log('Status: Regular Contract');
    console.log('  This is a regular smart contract, not EIP-7702 delegation');
  } else {
    console.log('Status: Regular EOA (No code)');
    console.log('  EIP-7702 delegation has not been performed yet');
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
