const crypto = require('crypto');

// クライアント側(index.htmlのcrypto.subtle.digest)と同じSHA-256方式でトークンIDを算出する。
// 実装自体は共有しない(Node/ブラウザで別実装)が、同じトークン文字列から同じ結果になることが重要
function sha256Hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = { sha256Hex };
