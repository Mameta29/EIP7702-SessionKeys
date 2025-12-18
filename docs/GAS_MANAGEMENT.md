# ⛽ セッションキーのガス代管理戦略

## 問題

Agentは毎回新しいセッションキーを生成するため、そのEOAにガス代（ETH）が必要です。
しかし、使い捨てのアドレスに毎回ETHを送るのは非効率です。

## 解決策

### 🎯 推奨: Meta-Transaction（ガスレス実行）

**コンセプト**: AgentはトランザクションデータのみOwnerに送り、Ownerが代わりに実行する

```typescript
// SessionKeyManager.solを拡張
function executeAsSessionKeyWithSignature(
    address sessionKey,
    address target,
    uint256 value,
    bytes calldata data,
    bytes calldata signature  // ← Agentの署名
) external onlyOwner {
    // 1. Agentの署名を検証
    bytes32 hash = keccak256(abi.encodePacked(target, value, data, nonce));
    require(sessionKey == recoverSigner(hash, signature), "Invalid signature");
    
    // 2. Session Keyを検証（既存ロジック）
    SessionKey storage sk = sessionKeys[sessionKey];
    require(sk.active, "Not active");
    // ... その他の検証
    
    // 3. Ownerのガスで実行
    (bool success, ) = target.call{value: value}(data);
    require(success, "Execution failed");
}
```

**フロー**:
```
Agent (ガス代ゼロ)
  ↓ トランザクションデータ + 署名
Owner (ガス代を払う)
  ↓ executeAsSessionKeyWithSignature()
SessionKeyManager (検証 + 実行)
```

**メリット**:
- ✅ Agentにガス代不要
- ✅ Ownerがすべてのガスを管理
- ✅ セキュリティ維持（Agentの署名で検証）

### 方法2: Paymasterパターン（ERC-4337風）

```typescript
// PaymasterManager.sol
contract PaymasterManager {
    mapping(address => bool) public sponsoredAgents;
    
    function sponsorAgent(address agent) external payable {
        require(msg.value >= 0.01 ether, "Minimum 0.01 ETH");
        payable(agent).transfer(msg.value);
        sponsoredAgents[agent] = true;
    }
}
```

**使用方法**:
```typescript
// Ownerが事前にAgentをスポンサー
await paymasterManager.sponsorAgent(agentAddress, { value: parseEther('0.01') });

// Agentは普通にトランザクション実行
await agent.executeTransfer({...});
```

### 方法3: セッションキー再利用（固定キー）

```typescript
// Agentの秘密鍵を固定
const FIXED_SESSION_KEY = process.env.AGENT_PRIVATE_KEY;

// または、決まった数のセッションキーをプール
const SESSION_KEY_POOL = [
    '0x1111...',  // Agent 1用
    '0x2222...',  // Agent 2用
    '0x3333...',  // Agent 3用
];
```

**メリット**:
- ✅ 一度ETHを送れば再利用可能
- ✅ シンプル

**デメリット**:
- ❌ キーが漏洩するリスク
- ❌ 複数Agentの管理が必要

### 方法4: バッチ実行（OwnerがまとめてAgentに送金）

```typescript
// Owner側で定期的にAgentにETHを送る
async function fundAgentIfNeeded(agentAddress: Address) {
    const balance = await publicClient.getBalance({ address: agentAddress });
    
    if (balance < parseEther('0.001')) {
        console.log(`[Owner] Funding Agent ${agentAddress}...`);
        await walletClient.sendTransaction({
            to: agentAddress,
            value: parseEther('0.01'),
        });
    }
}
```

## 🎯 最も実用的なソリューション

### ✅ Meta-Transaction + Relay Service

```
┌─────────────────────────────────────────────────────────┐
│  実用的なアーキテクチャ                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Agent (ガス代ゼロ)                                      │
│    ↓ {target, data, signature} を HTTP POST             │
│  Relay Service (Owner管理)                              │
│    ↓ executeAsSessionKeyWithSignature()                │
│  Owner EOA (7702 + SessionKeyManager)                   │
│    ↓ オンチェーン検証 + 実行                             │
│  Target Contract (JPYC Token)                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**実装例**:

```typescript
// Agent側（ガス代不要）
const txData = {
    target: tokenAddress,
    value: 0n,
    data: encodeFunctionData({...}),
    nonce: await getNextNonce(),
};

// Agentが署名
const signature = await agent.signMessage(hash(txData));

// Relay ServiceにHTTP POST（ガス代不要）
await fetch('https://relay.example.com/execute', {
    method: 'POST',
    body: JSON.stringify({ txData, signature }),
});

// Relay Service（Owner管理）がガス代を払って実行
```

## 🔧 実装の選択

| 方法 | 複雑度 | ガス効率 | セキュリティ | 推奨度 |
|------|--------|---------|------------|--------|
| Meta-Transaction | 中 | ✅ 最高 | ✅ 高 | ⭐⭐⭐ |
| Paymaster | 低 | ⚠️ 中 | ✅ 高 | ⭐⭐ |
| 固定キー再利用 | 低 | ✅ 高 | ⚠️ 中 | ⭐ |
| 定期的な送金 | 低 | ❌ 低 | ✅ 高 | ⭐ |

## 💡 推奨実装

**短期**: Paymaster（シンプル）
**長期**: Meta-Transaction + Relay Service（最適）

次のセクションで、Meta-Transactionの完全実装を示します。

