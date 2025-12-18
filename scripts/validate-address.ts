/**
 * アドレスの検証・チェックサム変換スクリプト
 */
import { getAddress, isAddress } from 'viem';

const addresses = {
  'Kernel Implementation (old)': '0x8104b7C8BA4C671D1b104180861baE630813d0DB',
  'Kernel Implementation (test)': '0x0DA6a956B9488eD4dd761E59f52FDc6c8068E6B5',
  'JPYC Token': '0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB',
  'Merchant': '0x8753A9e82ed76a4c1DC785D39d40e4108cAEf574',
};

console.log('🔍 Address Validation & Checksum Conversion\n');
console.log('='.repeat(70));

for (const [name, addr] of Object.entries(addresses)) {
  console.log(`\n${name}:`);
  console.log(`  Input:  ${addr}`);
  
  if (isAddress(addr)) {
    const checksummed = getAddress(addr);
    console.log(`  Output: ${checksummed}`);
    console.log(`  ✅ Valid`);
  } else {
    console.log(`  ❌ Invalid address`);
  }
}

console.log('\n' + '='.repeat(70));

