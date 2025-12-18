// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SessionKeyManager
 * @notice EIP-7702ベースのSession Key管理コントラクト
 * @dev EOAが7702でこのコントラクトにコードを委譲し、Session Key機能を取得する
 */
contract SessionKeyManager {
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
    
    // Session Key管理
    mapping(address => SessionKey) public sessionKeys;
    
    // イベント
    event SessionKeyRegistered(
        address indexed key,
        uint256 validUntil,
        uint256 maxAmount,
        address allowedTarget
    );
    event SessionKeyRevoked(address indexed key);
    event ExecutedBySessionKey(
        address indexed key,
        address indexed target,
        uint256 value,
        bytes data
    );
    
    /**
     * @notice Ownerのみアクセス可能
     * @dev EIP-7702では、EOA自身がコントラクトとして動作するため、
     *      msg.sender == address(this) でOwner判定
     */
    modifier onlyOwner() {
        require(msg.sender == address(this), "Only owner can call");
        _;
    }
    
    /**
     * @notice Session Keyを登録
     * @param _key Session Keyのアドレス
     * @param _validUntil 有効期限（Unix timestamp）
     * @param _maxAmount 1トランザクションあたりの最大金額
     * @param _allowedTarget 許可されたターゲットコントラクト
     * @param _allowedFunction 許可された関数セレクタ（例: 0xa9059cbb for transfer）
     * @param _maxUsage 最大使用回数
     */
    function registerSessionKey(
        address _key,
        uint256 _validUntil,
        uint256 _maxAmount,
        address _allowedTarget,
        bytes4 _allowedFunction,
        uint256 _maxUsage
    ) external onlyOwner {
        require(_key != address(0), "Invalid key address");
        require(_validUntil > block.timestamp, "Invalid expiry time");
        require(_allowedTarget != address(0), "Invalid target");
        require(_maxUsage > 0, "Max usage must be > 0");
        
        sessionKeys[_key] = SessionKey({
            key: _key,
            validUntil: _validUntil,
            maxAmount: _maxAmount,
            allowedTarget: _allowedTarget,
            allowedFunction: _allowedFunction,
            usageCount: 0,
            maxUsage: _maxUsage,
            active: true
        });
        
        emit SessionKeyRegistered(_key, _validUntil, _maxAmount, _allowedTarget);
    }
    
    /**
     * @notice Session Keyを取り消し
     * @param _key 取り消すSession Keyのアドレス
     */
    function revokeSessionKey(address _key) external onlyOwner {
        require(sessionKeys[_key].active, "Session key not active");
        sessionKeys[_key].active = false;
        emit SessionKeyRevoked(_key);
    }
    
    /**
     * @notice Session Keyでトランザクションを実行
     * @param target ターゲットコントラクト
     * @param value 送信するETH量
     * @param data 実行するcalldata
     * @return result 実行結果
     */
    function executeAsSessionKey(
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (bytes memory result) {
        SessionKey storage sk = sessionKeys[msg.sender];
        
        // Session Keyの検証
        require(sk.active, "Session key not active");
        require(sk.key == msg.sender, "Invalid session key");
        require(block.timestamp <= sk.validUntil, "Session key expired");
        require(sk.usageCount < sk.maxUsage, "Usage limit reached");
        require(target == sk.allowedTarget, "Target not allowed");
        require(value <= sk.maxAmount, "Amount exceeds limit");
        
        // 関数セレクタの検証
        if (data.length >= 4) {
            bytes4 selector;
            assembly {
                selector := calldataload(data.offset)
            }
            require(selector == sk.allowedFunction, "Function not allowed");
        }
        
        // 使用回数を増やす
        sk.usageCount++;
        
        // トランザクション実行
        (bool success, bytes memory returnData) = target.call{value: value}(data);
        require(success, "Execution failed");
        
        emit ExecutedBySessionKey(msg.sender, target, value, data);
        return returnData;
    }
    
    /**
     * @notice Session Keyの情報を取得
     * @param _key Session Keyのアドレス
     * @return Session Key情報
     */
    function getSessionKey(address _key) external view returns (SessionKey memory) {
        return sessionKeys[_key];
    }
    
    /**
     * @notice Session Keyが有効かチェック
     * @param _key Session Keyのアドレス
     * @return 有効な場合true
     */
    function isValidSessionKey(address _key) external view returns (bool) {
        SessionKey storage sk = sessionKeys[_key];
        return sk.active && 
               block.timestamp <= sk.validUntil && 
               sk.usageCount < sk.maxUsage;
    }
    
    /**
     * @notice ETHの受け取りを許可
     */
    receive() external payable {}
    
    /**
     * @notice Fallback関数
     */
    fallback() external payable {}
}

