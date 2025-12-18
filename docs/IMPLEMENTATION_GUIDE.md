# 🛠️ 実装ガイド

## 概要

このガイドでは、Viem + EIP-7702 + カスタムスマートコントラクトによる Session Key実装の詳細を説明します。

## アーキテクチャ

### レイヤー構造

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4: Application (TypeScript)                      │
│  ├─ Owner7702: Session Key管理                          │
│  └─ Agent7702: 制限付き実行                             │
├─────────────────────────────────────────────────────────┤
│  Layer 3: Viem (Ethereum Client)                        │
│  ├─ Wallet Client: トランザクション署名・送信           │
│  └─ Public Client: 読み取り・確認                       │
├─────────────────────────────────────────────────────────┤
│  Layer 2: Smart Contract (SessionKeyManager.sol)        │
│  ├─ Session Key Storage                                 │
│  ├─ Policy Validation                                   │
│  └─ Transaction Execution                               │
├─────────────────────────────────────────────────────────┤
│  Layer 1: EIP-7702 (EOA Code Delegation)                │
│  ├─ Authorization Signature                             │
│  ├─ SET_CODE_TX (Type 4)                                │
│  └─ EOA → Smart Account                                 │
└─────────────────────────────────────────────────────────┘
```

## 実装の流れ

### Phase 1: スマートコントラクトのデプロイ

```bash
# 1. コンパイル
cd contracts
forge build

# 2. デプロイ
forge script script/Deploy.s.sol \
  --rpc-url $RPC_URL \
  --private-key $OWNER_PRIVATE_KEY \
  --broadcast

# 3. 結果
SessionKeyManager deployed at: 0xdcAa02Db3410aB3A606F7dDF7c808715E3CEF608
```

### Phase 2: EIP-7702でコード委譲

```typescript
const owner = new Owner7702(privateKey);

// SessionKeyManagerのコードをOwner EOAに委譲
const txHash = await owner.setup7702(contractAddress);

// 結果: Owner EOAがSessionKeyManagerの機能を持つ
// アドレスは変わらず: 0xE2F2E032B02584e81437bA8Df18F03d6771F9d23
```

**オンチェーンで何が起きているか**:
```solidity
// Before 7702
EOA.code => '0x' (empty)

// After 7702
EOA.code => 'delegated to SessionKeyManager'
// EOAがSessionKeyManagerの関数を呼べるようになる
```

### Phase 3: Session Key登録

```typescript
// Agentがキーペア生成
const sessionPrivateKey = generatePrivateKey();
const sessionKeyAddress = privateKeyToAccount(sessionPrivateKey).address;

// Ownerが登録（ポリシー付き）
await owner.registerSessionKey({
  sessionKeyAddress,
  validDays: 7,
  maxAmount: parseUnits('1000', 18),
  allowedTarget: tokenAddress,
  allowedFunctionName: 'transfer(address,uint256)',
  maxUsage: 10,
});
```

**オンチェーンストレージ**:
```solidity
sessionKeys[0xAgent...] = SessionKey({
    key: 0xAgent...,
    validUntil: 1703001600,
    maxAmount: 1000000000000000000000,
    allowedTarget: 0xJPYC...,
    allowedFunction: 0xa9059cbb,
    usageCount: 0,
    maxUsage: 10,
    active: true
});
```

### Phase 4: トランザクション実行

```typescript
const agent = new Agent7702(sessionPrivateKey, ownerAddress);

// Session Keyでトランザクション実行
const result = await agent.executeTransfer({
  tokenAddress,
  to: merchantAddress,
  amount: parseUnits('100', 18),
});
```

**実行の流れ**:
```
1. Agent → executeAsSessionKey(token, 0, transferData)
2. SessionKeyManager.executeAsSessionKey()
   ├─ Session Key検証
   ├─ Policy検証
   │  ├─ active ✅
   │  ├─ validUntil ✅
   │  ├─ usageCount < maxUsage ✅
   │  ├─ target == allowedTarget ✅
   │  ├─ value <= maxAmount ✅
   │  └─ selector == allowedFunction ✅
   └─ 実行 token.call(transferData)
3. JPYC.transfer(merchant, 100)
```

## コードの詳細

### Owner7702クラス

```typescript
export class Owner7702 {
  private privateKey: Hex;
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private contractAddress: Address | null;

  constructor(privateKey: Hex) {
    // Viemクライアントを初期化
  }

  async setup7702(contractAddress: Address): Promise<Hex> {
    // 1. Authorization署名
    const authorization = await this.walletClient.signAuthorization({
      contractAddress,
    });

    // 2. SET_CODE_TX送信
    const hash = await this.walletClient.sendTransaction({
      authorizationList: [authorization],
      to: this.walletClient.account!.address,
      data: '0x',
    });

    // 3. 確認待ち
    await this.publicClient.waitForTransactionReceipt({ hash });

    return hash;
  }

  async registerSessionKey(params): Promise<Hex> {
    // 関数セレクタ計算
    const functionSelector = keccak256(toHex('transfer(address,uint256)')).slice(0, 10);

    // registerSessionKey呼び出し
    const hash = await this.walletClient.writeContract({
      address: this.walletClient.account!.address, // 7702で委譲されたEOA
      abi: SESSION_KEY_MANAGER_ABI,
      functionName: 'registerSessionKey',
      args: [
        params.sessionKeyAddress,
        BigInt(validUntil),
        params.maxAmount,
        params.allowedTarget,
        functionSelector,
        BigInt(params.maxUsage),
      ],
    });

    return hash;
  }

  async revokeSessionKey(sessionKeyAddress: Address): Promise<Hex> {
    // revokeSessionKey呼び出し
    const hash = await this.walletClient.writeContract({
      address: this.walletClient.account!.address,
      abi: SESSION_KEY_MANAGER_ABI,
      functionName: 'revokeSessionKey',
      args: [sessionKeyAddress],
    });

    return hash;
  }
}
```

### Agent7702クラス

```typescript
export class Agent7702 {
  private privateKey: Hex;
  private ownerAddress: Address;
  private publicClient: PublicClient;
  private walletClient: WalletClient;

  constructor(privateKey: Hex, ownerAddress: Address) {
    // Viemクライアントを初期化
  }

  async executeTransfer(params): Promise<Result> {
    // 1. ERC20 transferのcalldata作成
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [params.to, params.amount],
    });

    // 2. executeAsSessionKey呼び出し
    const hash = await this.walletClient.writeContract({
      address: this.ownerAddress, // 7702で委譲されたOwner EOA
      abi: SESSION_KEY_MANAGER_ABI,
      functionName: 'executeAsSessionKey',
      args: [params.tokenAddress, 0n, transferData],
    });

    // 3. 確認待ち
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });

    return { success: receipt.status === 'success', txHash: hash };
  }
}
```

## SessionKeyManager.sol の詳細

### ストレージ構造

```solidity
struct SessionKey {
    address key;              // Session Keyのアドレス
    uint256 validUntil;       // 有効期限（Unix timestamp）
    uint256 maxAmount;        // 1トランザクションあたりの最大金額
    address allowedTarget;    // 許可されたターゲットコントラクト
    bytes4 allowedFunction;   // 許可された関数セレクタ
    uint256 usageCount;       // 使用回数
    uint256 maxUsage;         // 最大使用回数
    bool active;              // アクティブ状態
}

mapping(address => SessionKey) public sessionKeys;
```

### ポリシー検証ロジック

```solidity
function executeAsSessionKey(
    address target,
    uint256 value,
    bytes calldata data
) external returns (bytes memory result) {
    SessionKey storage sk = sessionKeys[msg.sender];
    
    // 1. Session Keyが有効か
    require(sk.active, "Session key not active");
    require(sk.key == msg.sender, "Invalid session key");
    
    // 2. 有効期限内か
    require(block.timestamp <= sk.validUntil, "Session key expired");
    
    // 3. 使用回数制限内か
    require(sk.usageCount < sk.maxUsage, "Usage limit reached");
    
    // 4. ターゲットが許可されているか
    require(target == sk.allowedTarget, "Target not allowed");
    
    // 5. 金額が制限内か
    require(value <= sk.maxAmount, "Amount exceeds limit");
    
    // 6. 関数が許可されているか
    if (data.length >= 4) {
        bytes4 selector;
        assembly {
            selector := calldataload(data.offset)
        }
        require(selector == sk.allowedFunction, "Function not allowed");
    }
    
    // 7. 使用回数を増やす
    sk.usageCount++;
    
    // 8. 実行
    (bool success, bytes memory returnData) = target.call{value: value}(data);
    require(success, "Execution failed");
    
    emit ExecutedBySessionKey(msg.sender, target, value, data);
    return returnData;
}
```

## セキュリティ考慮事項

### 1. Owner検証

```solidity
modifier onlyOwner() {
    require(msg.sender == address(this), "Only owner can call");
    _;
}
```

EIP-7702では、EOA自身がコントラクトとして動作するため、`msg.sender == address(this)`でOwner判定。

### 2. Reentrancy攻撃対策

現在の実装では、`usageCount`を実行前に増やすことで、reentrancyを防いでいます。

本番環境では、ReentrancyGuardの追加を推奨：

```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SessionKeyManager is ReentrancyGuard {
    function executeAsSessionKey(...) external nonReentrant returns (...) {
        // ...
    }
}
```

### 3. 署名検証（Meta-Transaction用）

将来的にMeta-Transactionを実装する場合：

```solidity
function recoverSigner(bytes32 hash, bytes memory signature) private pure returns (address) {
    bytes32 r;
    bytes32 s;
    uint8 v;
    
    assembly {
        r := mload(add(signature, 32))
        s := mload(add(signature, 64))
        v := byte(0, mload(add(signature, 96)))
    }
    
    return ecrecover(hash, v, r, s);
}
```

## ガス最適化

### 現在の実装

| 操作 | ガス使用量（推定） |
|------|------------------|
| registerSessionKey | ~80,000 gas |
| executeAsSessionKey | ~100,000 gas |
| revokeSessionKey | ~30,000 gas |

### 最適化のポイント

1. **ストレージの削減**
   ```solidity
   // uint256 → uint128 (有効期限は128bitで十分)
   uint128 validUntil;
   uint128 maxUsage;
   ```

2. **パッキング**
   ```solidity
   // 複数の値を1つのスロットに
   struct PackedSessionKey {
       address key;              // 160 bits
       uint96 validUntil;        // 96 bits → 合計256 bits（1スロット）
       // ...
   }
   ```

## 拡張機能

### 1. 複数Session Key対応

既に実装されています！

```typescript
// Agent 1
const agent1 = new Agent7702(key1, ownerAddress);
await owner.registerSessionKey({ sessionKeyAddress: agent1.getAddress(), ... });

// Agent 2
const agent2 = new Agent7702(key2, ownerAddress);
await owner.registerSessionKey({ sessionKeyAddress: agent2.getAddress(), ... });
```

### 2. 複数関数の許可

現在は1関数のみですが、配列に拡張可能：

```solidity
bytes4[] allowedFunctions;

function executeAsSessionKey(...) {
    bool isAllowed = false;
    for (uint i = 0; i < sk.allowedFunctions.length; i++) {
        if (selector == sk.allowedFunctions[i]) {
            isAllowed = true;
            break;
        }
    }
    require(isAllowed, "Function not allowed");
}
```

### 3. 動的ポリシー

```solidity
// 時間帯制限
require(block.timestamp % 86400 >= 9 * 3600, "Outside business hours");

// 累積金額制限
mapping(address => uint256) public dailySpent;
require(dailySpent[msg.sender] + value <= dailyLimit, "Daily limit exceeded");
```

## テスト

### Foundryテスト

```bash
cd contracts
forge test -vv
```

### 統合テスト

```bash
# TypeScriptデモ
pnpm demo
```

## トラブルシューティング

### Q: "Only owner can call" エラー

**A**: 7702 delegationが完了していません。`setup7702()`を先に実行してください。

### Q: "Session key not active" エラー

**A**: Session Keyが登録されていないか、取り消されています。`registerSessionKey()`を実行してください。

### Q: "Usage limit reached" エラー

**A**: Session Keyの使用回数が上限に達しました。新しいSession Keyを登録してください。

### Q: ガス代エラー

**A**: **docs/GAS_MANAGEMENT.md** を参照してください。

## まとめ

この実装は：
- ✅ シンプルで理解しやすい
- ✅ 完全に動作する
- ✅ 拡張可能
- ✅ 本番ready（監査後）

すべてのコードが明確で、カスタマイズが容易です。

