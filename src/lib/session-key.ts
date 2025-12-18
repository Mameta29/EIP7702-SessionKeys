/**
 * Pure Viem + EIP-7702 + カスタムスマートコントラクト実装
 * 
 * ZeroDevのSession Keys統合を使わず、純粋なViemとカスタムコントラクトで実装
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// SessionKeyManagerコントラクトのABI
const SESSION_KEY_MANAGER_ABI = [
  {
    type: 'function',
    name: 'registerSessionKey',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_key', type: 'address' },
      { name: '_validUntil', type: 'uint256' },
      { name: '_maxAmount', type: 'uint256' },
      { name: '_allowedTarget', type: 'address' },
      { name: '_allowedFunction', type: 'bytes4' },
      { name: '_maxUsage', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeAsSessionKey',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [{ name: 'result', type: 'bytes' }],
  },
  {
    type: 'function',
    name: 'revokeSessionKey',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_key', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isValidSessionKey',
    stateMutability: 'view',
    inputs: [{ name: '_key', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * Owner側の実装（Pure Viem + 7702）
 */
export class Owner7702 {
  private privateKey: Hex;
  private publicClient: ReturnType<typeof createPublicClient>;
  private walletClient: ReturnType<typeof createWalletClient>;
  private contractAddress: Address | null = null;

  constructor(privateKey: Hex) {
    this.privateKey = privateKey;
    const account = privateKeyToAccount(privateKey);

    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(process.env.RPC_URL),
    });

    this.walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(process.env.RPC_URL),
    });
  }

  /**
   * Step 1: EIP-7702でSessionKeyManagerコントラクトにコード委譲
   */
  async setup7702(contractAddress: Address): Promise<Hex> {
    this.contractAddress = contractAddress;

    console.log('[Owner] Setting up EIP-7702 delegation...');
    console.log(`[Owner] EOA: ${this.walletClient.account!.address}`);
    console.log(`[Owner] Delegating to: ${contractAddress}`);

    // 7702 Authorization署名
    const authorization = await this.walletClient.signAuthorization({
      contractAddress,
    });

    console.log('[Owner] Authorization signed');

    // SET_CODE_TX送信
    const hash = await this.walletClient.sendTransaction({
      authorizationList: [authorization],
      to: this.walletClient.account!.address,
      data: '0x',
    });

    console.log(`[Owner] ✅ 7702 Delegation TX: ${hash}`);
    console.log('[Owner] Waiting for confirmation...');

    try {
      await this.publicClient.waitForTransactionReceipt({ 
        hash,
        timeout: 60_000, // 60秒タイムアウト
      });
      console.log('[Owner] ✅ Transaction confirmed!');
    } catch (error: any) {
      console.log('[Owner] ⚠️  Confirmation timeout (transaction likely still pending)');
      console.log('[Owner] Transaction was sent - check explorer for status');
    }

    console.log('[Owner] ✅ 7702 delegation complete!');
    return hash;
  }

  /**
   * Step 2: Session Keyを登録
   */
  async registerSessionKey(params: {
    sessionKeyAddress: Address;
    validDays: number;
    maxAmount: bigint;
    allowedTarget: Address;
    allowedFunctionName: string; // e.g., 'transfer(address,uint256)'
    maxUsage: number;
  }): Promise<Hex> {
    if (!this.contractAddress) {
      throw new Error('Contract address not set. Call setup7702() first.');
    }

    console.log('[Owner] Registering Session Key...');
    console.log(`[Owner] Session Key: ${params.sessionKeyAddress}`);
    console.log(`[Owner] Valid for: ${params.validDays} days`);
    console.log(`[Owner] Max usage: ${params.maxUsage} times`);

    const validUntil = BigInt(Math.floor(Date.now() / 1000) + params.validDays * 86400);

    // 関数セレクタを取得（transfer(address,uint256) → 0xa9059cbb）
    // keccak256を使って直接計算
    const functionSignature = params.allowedFunctionName;
    const functionHash = keccak256(toHex(functionSignature));
    const functionSelector = functionHash.slice(0, 10) as Hex; // 最初の4バイト

    console.log(`[Owner] Function signature: ${functionSignature}`);
    console.log(`[Owner] Function selector: ${functionSelector}`);

    // registerSessionKeyを呼び出す
    // EOAは7702でSessionKeyManagerのコードを持っているため、直接呼び出せる
    const hash = await this.walletClient.writeContract({
      address: this.walletClient.account!.address, // 7702で委譲されたEOA自身
      abi: SESSION_KEY_MANAGER_ABI,
      functionName: 'registerSessionKey',
      args: [
        params.sessionKeyAddress,
        validUntil,
        params.maxAmount,
        params.allowedTarget,
        functionSelector as `0x${string}`,
        BigInt(params.maxUsage),
      ],
    });

    console.log(`[Owner] ✅ Session Key Registered: ${hash}`);
    console.log('[Owner] Waiting for confirmation...');

    try {
      await this.publicClient.waitForTransactionReceipt({ 
        hash,
        timeout: 60_000,
      });
      console.log('[Owner] ✅ Transaction confirmed!');
    } catch (error: any) {
      console.log('[Owner] ⚠️  Confirmation timeout (transaction likely still pending)');
    }

    console.log('[Owner] ✅ Registration complete!');
    return hash;
  }

  /**
   * Step 3: Session Keyを取り消し
   */
  async revokeSessionKey(sessionKeyAddress: Address): Promise<Hex> {
    if (!this.contractAddress) {
      throw new Error('Contract address not set.');
    }

    console.log(`[Owner] Revoking Session Key: ${sessionKeyAddress}`);

    const hash = await this.walletClient.writeContract({
      address: this.walletClient.account!.address,
      abi: SESSION_KEY_MANAGER_ABI,
      functionName: 'revokeSessionKey',
      args: [sessionKeyAddress],
    });

    console.log(`[Owner] ✅ Session Key Revoked: ${hash}`);

    await this.publicClient.waitForTransactionReceipt({ hash });

    return hash;
  }

  /**
   * Session Key情報を取得
   */
  async getSessionKey(sessionKeyAddress: Address) {
    if (!this.contractAddress) {
      throw new Error('Contract address not set.');
    }

    return await this.publicClient.readContract({
      address: this.walletClient.account!.address,
      abi: SESSION_KEY_MANAGER_ABI,
      functionName: 'getSessionKey',
      args: [sessionKeyAddress],
    });
  }

  /**
   * Ownerアドレスを取得
   */
  getAddress(): Address {
    return this.walletClient.account!.address;
  }
}

/**
 * Agent側の実装（Session Key使用）
 */
export class Agent7702 {
  private privateKey: Hex;
  private ownerAddress: Address;
  private publicClient: ReturnType<typeof createPublicClient>;
  private walletClient: ReturnType<typeof createWalletClient>;

  constructor(privateKey: Hex, ownerAddress: Address) {
    this.privateKey = privateKey;
    this.ownerAddress = ownerAddress;

    const account = privateKeyToAccount(privateKey);

    this.publicClient = createPublicClient({
      chain: sepolia,
      transport: http(process.env.RPC_URL),
    });

    this.walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(process.env.RPC_URL),
    });
  }

  /**
   * Session Keyでトランザクションを実行
   */
  async executeTransfer(params: {
    tokenAddress: Address;
    to: Address;
    amount: bigint;
  }): Promise<{ success: boolean; txHash?: Hex; error?: string }> {
    console.log('\n[Agent] Executing transfer with Session Key...');
    console.log(`[Agent]   Token:  ${params.tokenAddress}`);
    console.log(`[Agent]   To:     ${params.to}`);
    console.log(`[Agent]   Amount: ${params.amount.toString()}`);

    try {
      // ERC20 transferのcalldataを作成
      const transferData = encodeFunctionData({
        abi: [
          {
            type: 'function',
            name: 'transfer',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          },
        ],
        functionName: 'transfer',
        args: [params.to, params.amount],
      });

      console.log('[Agent] Calling executeAsSessionKey on Owner EOA...');

      // OwnerのEOA（7702で委譲済み）のexecuteAsSessionKeyを呼び出す
      const hash = await this.walletClient.writeContract({
        address: this.ownerAddress, // 7702で委譲されたOwner EOA
        abi: SESSION_KEY_MANAGER_ABI,
        functionName: 'executeAsSessionKey',
        args: [params.tokenAddress, 0n, transferData],
      });

      console.log(`[Agent] ✅ Transaction sent: ${hash}`);
      console.log('[Agent] Waiting for confirmation...');

      try {
        const receipt = await this.publicClient.waitForTransactionReceipt({ 
          hash,
          timeout: 60_000,
        });

        if (receipt.status === 'success') {
          console.log(`[Agent] ✅ SUCCESS! Transfer completed`);
          return { success: true, txHash: hash };
        } else {
          console.log('[Agent] ❌ Transaction reverted');
          return { success: false, error: 'Transaction reverted' };
        }
      } catch (confirmError: any) {
        console.log('[Agent] ⚠️  Confirmation timeout');
        console.log(`[Agent] Transaction sent: ${hash} (check explorer for status)`);
        return { success: true, txHash: hash }; // 送信は成功したとみなす
      }
    } catch (error: any) {
      const errorMessage = this.parseError(error);
      console.log(`[Agent] ❌ FAILED: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * エラーメッセージをパース
   */
  private parseError(error: any): string {
    const message = error.message || error.toString();

    if (message.includes('Session key not active')) {
      return 'Session key has been revoked or not registered';
    }
    if (message.includes('Session key expired')) {
      return 'Session key has expired';
    }
    if (message.includes('Usage limit reached')) {
      return 'Maximum usage count reached';
    }
    if (message.includes('Target not allowed')) {
      return 'Target contract not in allowed list';
    }
    if (message.includes('Amount exceeds limit')) {
      return 'Amount exceeds per-transaction limit';
    }
    if (message.includes('Function not allowed')) {
      return 'Function selector not allowed';
    }

    return message.length > 150 ? message.slice(0, 150) + '...' : message;
  }

  /**
   * Agentアドレスを取得
   */
  getAddress(): Address {
    return this.walletClient.account!.address;
  }
}

