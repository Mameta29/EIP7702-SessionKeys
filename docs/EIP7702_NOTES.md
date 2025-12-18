# EIP-7702 重要な発見

## プリフィックスについて

動画（中城氏のEIP-7702解説）によると：

### EOAのコード領域に書き込まれる内容

```
0xEF01 + 委譲先コントラクトアドレス（20バイト）
= 合計23バイト
```

**例**:
```
Prefix: 0xEF01
Address: 0xdcAa02Db3410aB3A606F7dDF7c808715E3CEF608
結果: 0xEF01dcAa02Db3410aB3A606F7dDF7c808715E3CEF608
```

### ワンレベル制限

委譲コードの解決は**1回のみ**：
- EOA → 委譲先コントラクト（OK）
- EOA → EOA → コントラクト（2段目のEOAの委譲は解決されない）

理由：無限ループ防止

## 現在の実装の検証結果

```
Owner EOA: 0xE2F2E032B02584e81437bA8Df18F03d6771F9d23
Code: undefined (No code)
```

**発見**: トランザクション実行後、コードが残っていない

## EIP-7702の重要な特性

### 一時的な委譲 vs 永続的な委譲

**調査が必要**:
1. authorizationは1トランザクションのみ有効？
2. それとも永続的？
3. 各トランザクションでauthorizationListを含める必要がある？

### Viemの実装確認

```typescript
// 現在の実装
const authorization = await walletClient.signAuthorization({
  contractAddress,
});

await walletClient.sendTransaction({
  authorizationList: [authorization],
  to: account.address,
  data: '0x',
});
```

**疑問**: この後のトランザクション（registerSessionKey等）でも、authorizationListが必要？

## 次のステップ

1. EIP-7702仕様を再確認
2. 各トランザクションでのauthorization要否を確認
3. 必要に応じて実装修正

