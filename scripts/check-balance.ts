/**
 * Owner EOAの残高確認スクリプト
 * 
 * 実行方法:
 * pnpm tsx scripts/check-balance.ts
 */
import 'dotenv/config';
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { sepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

async function main() {
  console.log('🔍 Owner EOA 残高確認\n');
  console.log('='.repeat(60));

  // 環境変数チェック
  if (!process.env.OWNER_PRIVATE_KEY) {
    console.error('❌ Error: OWNER_PRIVATE_KEY not set in .env file');
    process.exit(1);
  }

  if (!process.env.RPC_URL) {
    console.error('❌ Error: RPC_URL not set in .env file');
    process.exit(1);
  }

  // Owner アドレスを取得
  const ownerAccount = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY as `0x${string}`);
  const ownerAddress = ownerAccount.address;

  console.log(`📍 Owner Address: ${ownerAddress}\n`);

  // Public client作成
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.RPC_URL),
  });

  try {
    // ETH残高確認
    console.log('💰 ETH Balance:');
    const ethBalance = await client.getBalance({ address: ownerAddress });
    const ethBalanceFormatted = Number(ethBalance) / 10 ** 18;
    console.log(`   ${ethBalanceFormatted.toFixed(6)} ETH`);

    if (ethBalanceFormatted < 0.01) {
      console.log('   ⚠️  Warning: ETH balance is low. Get some from faucet.');
      console.log('   Faucet: https://sepoliafaucet.com/');
    } else {
      console.log('   ✅ Sufficient ETH for gas fees');
    }

    // JPYCトークン残高確認
    if (process.env.TEST_TOKEN_ADDRESS) {
      console.log('\n🪙 JPYC Token Balance:');
      
      try {
        const tokenBalance = await client.readContract({
          address: process.env.TEST_TOKEN_ADDRESS as Address,
          abi: parseAbi([
            'function balanceOf(address) view returns (uint256)',
            'function decimals() view returns (uint8)',
            'function symbol() view returns (string)',
          ]),
          functionName: 'balanceOf',
          args: [ownerAddress],
        });

        // decimals取得
        const decimals = await client.readContract({
          address: process.env.TEST_TOKEN_ADDRESS as Address,
          abi: parseAbi(['function decimals() view returns (uint8)']),
          functionName: 'decimals',
        });

        // symbol取得
        const symbol = await client.readContract({
          address: process.env.TEST_TOKEN_ADDRESS as Address,
          abi: parseAbi(['function symbol() view returns (string)']),
          functionName: 'symbol',
        });

        const tokenBalanceFormatted = Number(tokenBalance) / 10 ** Number(decimals);
        console.log(`   ${tokenBalanceFormatted.toFixed(2)} ${symbol}`);
        console.log(`   Token Address: ${process.env.TEST_TOKEN_ADDRESS}`);

        if (tokenBalanceFormatted === 0) {
          console.log('   ⚠️  Warning: No tokens. You need some tokens to test transfers.');
        } else {
          console.log('   ✅ Token balance available');
        }
      } catch (error: any) {
        console.log(`   ❌ Error reading token balance: ${error.message}`);
        console.log('   Make sure TEST_TOKEN_ADDRESS is correct');
      }
    }

    // 受け取り先アドレス確認
    if (process.env.MERCHANT_ADDRESS) {
      console.log('\n📮 Merchant Address (Recipient):');
      console.log(`   ${process.env.MERCHANT_ADDRESS}`);
      console.log('   ℹ️  Agent will be allowed to send tokens to this address only');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Balance check complete!\n');

    // サマリー
    const hasEnoughEth = ethBalanceFormatted >= 0.01;
    const hasTokenAddress = !!process.env.TEST_TOKEN_ADDRESS;
    const hasMerchantAddress = !!process.env.MERCHANT_ADDRESS;

    console.log('📋 Setup Status:');
    console.log(`   ${hasEnoughEth ? '✅' : '❌'} ETH for gas fees`);
    console.log(`   ${hasTokenAddress ? '✅' : '❌'} Token address configured`);
    console.log(`   ${hasMerchantAddress ? '✅' : '❌'} Merchant address configured`);

    if (hasEnoughEth && hasTokenAddress && hasMerchantAddress) {
      console.log('\n🎉 Ready to run the demo!');
      console.log('   Run: pnpm demo');
    } else {
      console.log('\n⚠️  Please complete the setup before running the demo.');
      console.log('   See: SETUP.md');
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

