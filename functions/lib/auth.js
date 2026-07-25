const { HttpsError } = require('firebase-functions/v2/https');
const { db } = require('./admin');

// Firebase Authの疑似メール(乗務員コード@...)からコードを求める。
// firestore.rules の myCode() と同じ正規化規則(大文字化)であること。
// この変換規則が firestore.rules と ここ(functions/lib/auth.js) の2箇所に存在することは
// TECH_DEBT.md に記録済み(将来ログイン方式を変える際に片方だけ直す事故を防ぐため)
function codeFromAuth(auth) {
  if (!auth || !auth.token || !auth.token.email) {
    throw new HttpsError('unauthenticated', '認証が必要です');
  }
  return auth.token.email.split('@')[0].toUpperCase();
}

// 呼び出し元が管理者であることを検証する。sendUnreadReminder/estimateNotifyAudienceで共用。
// Firestore rulesはcallable関数には効かず、Admin SDKはrulesを迂回するため、
// この検証を怠ると誰でも全ドライバーへ通知を送れてしまう
async function requireAdmin(auth) {
  const code = codeFromAuth(auth);
  const snap = await db.collection('users').doc(code).get();
  if (!snap.exists || snap.data().role !== 'admin') {
    throw new HttpsError('permission-denied', '管理者のみ実行できます');
  }
  return code;
}

module.exports = { codeFromAuth, requireAdmin };
