# EIP-7702 Session Keys Demo

AI Agent向けSession Key実装のデモンストレーション

## 概要

このプロジェクトは、EIP-7702を使用してAIエージェントに安全に制限付き権限を委譲する仕組みを実装したものです。AIエージェントに秘密鍵を渡すことなく、時限付き・制限付きのトランザクション実行権限を付与できます。

## デモ内容

- EIP-7702によるEOAのSmart Account化
- Session Keyの登録とポリシー設定
- 制限付きトランザクションの実行
- ポリシー違反時のエラーハンドリング
- Session Keyの取り消し

## デプロイ済みコントラクト

**Network**: Sepolia Testnet

**SessionKeyManager Contract**
- Address: `0xdcAa02Db3410aB3A606F7dDF7c808715E3CEF608`
- Etherscan: https://sepolia.etherscan.io/address/0xdcAa02Db3410aB3A606F7dDF7c808715E3CEF608

## 確認済みトランザクション

**EIP-7702 Delegation**
- TX: `0x879809bc704cb5cf3a79f825c3af4170ad54eeebfcf16c4d54f803f1ffe854ff`
- https://sepolia.etherscan.io/tx/0x879809bc704cb5cf3a79f825c3af4170ad54eeebfcf16c4d54f803f1ffe854ff

**Session Key Registration**
- TX: `0x9c4328e67b260efd0c5740fe651fce5fcbca086ca8af439a7d6aad79e4926517`
- https://sepolia.etherscan.io/tx/0x9c4328e67b260efd0c5740fe651fce5fcbca086ca8af439a7d6aad79e4926517

## アーキテクチャ

```
Owner EOA
  |
  | [1. EIP-7702 Delegation]
  v
Owner EOA + SessionKeyManager Code
  |
  | [2. Register Session Key]
  v
Session Key Registered with Policies
  |
  | [3. Agent Execution]
  v
executeAsSessionKey()
  -> Policy Validation (on-chain)
  -> Transaction Execution
```

### 主要コンポーネント

**SessionKeyManager.sol**
- Session Keyの登録・管理
- ポリシーのオンチェーン検証
- 制限付きトランザクション実行

**Owner7702クラス**
- EIP-7702でEOAにコード委譲
- Session Keyの登録・取り消し

**Agent7702クラス**
- Session Key生成（秘密鍵は自己管理）
- 制限付きトランザクション実行

## セットアップ

### 必要なもの

- Node.js 20+
- pnpm
- Foundry（コントラクトデプロイ用）
- Sepolia ETH（ガス代）

### インストール

```bash
pnpm install
```

### 環境変数設定

```bash
cp .env.template .env
```

`.env`ファイルを編集：

```env
OWNER_PRIVATE_KEY=0x...
RPC_URL=https://sepolia.drpc.org
TEST_TOKEN_ADDRESS=0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB
MERCHANT_ADDRESS=0x8753A9e82ed76a4c1DC785D39d40e4108cAEf574
SESSION_KEY_MANAGER_ADDRESS=0xdcAa02Db3410aB3A606F7dDF7c808715E3CEF608
```

## デモ実行

```bash
pnpm demo
```

### 実行されるシナリオ

1. EIP-7702 Delegation - EOAをSmart Account化
2. Session Key Registration - ポリシー付きでSession Key登録
3. Success Transfer - 制限内の送金（成功）
4. Amount Limit Test - 金額制限超過（失敗）
5. Invalid Target Test - 許可されていない宛先（失敗）

## 技術スタック

- Viem 2.21.0 - Ethereum interactions
- EIP-7702 - EOA code delegation
- Solidity 0.8.20 - SessionKeyManager contract
- Foundry - Smart contract development
- TypeScript 5.x

## プロジェクト構造

```
.
├── contracts/
│   ├── src/SessionKeyManager.sol    # Session Key管理コントラクト
│   ├── test/SessionKeyManager.t.sol # Foundryテスト
│   └── script/Deploy.s.sol          # デプロイスクリプト
├── src/
│   ├── lib/session-key.ts           # Owner/Agentクラス実装
│   ├── contracts/interfaces.ts      # ERC20 ABI
│   ├── demo.ts                      # デモスクリプト
│   └── index.ts
├── scripts/
│   ├── check-balance.ts             # 残高確認ツール
│   └── validate-address.ts          # アドレス検証ツール
└── docs/
    ├── GAS_MANAGEMENT.md            # ガス代管理戦略
    ├── FEATURE_COMPARISON.md        # 機能比較
    └── IMPLEMENTATION_GUIDE.md      # 実装ガイド
```

## セキュリティ機能

### Session Keyポリシー

- 有効期限制御（validUntil）
- 金額制限（maxAmount per transaction）
- 使用回数制限（maxUsage）
- ターゲットコントラクト制限（allowedTarget）
- 関数制限（allowedFunction selector）

### オンチェーン検証

すべてのポリシーはSessionKeyManager.solで検証され、改ざん不可能です。

### 即座の取り消し

OwnerはいつでもrevokeSessionKey()でSession Keyを無効化できます。

## ガス代管理

Session Keyを使用するAgentもガス代が必要です。解決策は複数あります：

- Meta-Transaction（Ownerがガス代を負担）
- Paymaster（事前にAgentにETH送信）
- 固定キー再利用

詳細は `docs/GAS_MANAGEMENT.md` を参照。

## 開発コマンド

```bash
# デモ実行
pnpm demo

# 残高確認
pnpm check

# 型チェック
pnpm typecheck

# コントラクトテスト
pnpm test:contract

# コントラクトデプロイ
pnpm deploy:contract
```

## ドキュメント

- `docs/GAS_MANAGEMENT.md` - ガス代管理の詳細戦略
- `docs/FEATURE_COMPARISON.md` - 他ソリューションとの比較
- `docs/IMPLEMENTATION_GUIDE.md` - 実装の詳細ガイド
- `TECH_BLOG.md` - 技術ブログ記事

## ライセンス

MIT License

## 参考リンク

- EIP-7702 Specification: https://eips.ethereum.org/EIPS/eip-7702
- Viem Documentation: https://viem.sh/
- Foundry Book: https://book.getfoundry.sh/
