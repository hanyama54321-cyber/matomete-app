const { db } = require('./admin');

async function getCodesByRole(role) {
  const snap = await db.collection('users').where('role', '==', role).get();
  return snap.docs.map((d) => d.id);
}

// notifyPrefs で eventKey が false のユーザーを除外したうえで、各ユーザーの tokens
// サブコレクションを収集する。notifyPrefs 未設定(フィールド自体が無い、または該当キーが無い)は
// 初期値ON として扱う(false のときのみ除外)
async function collectTokensForCodes(codes, eventKey) {
  const records = [];
  for (const code of codes) {
    const userSnap = await db.collection('users').doc(code).get();
    if (!userSnap.exists) continue;
    const prefs = userSnap.data().notifyPrefs || {};
    if (prefs[eventKey] === false) continue;

    const tokensSnap = await db.collection('users').doc(code).collection('tokens').get();
    tokensSnap.docs.forEach((t) => {
      records.push({ code, tokenId: t.id, token: t.data().token });
    });
  }
  return records;
}

async function getDriverTokens(eventKey) {
  const codes = await getCodesByRole('driver');
  return collectTokensForCodes(codes, eventKey);
}

async function getAdminTokens(eventKey) {
  const codes = await getCodesByRole('admin');
  return collectTokensForCodes(codes, eventKey);
}

module.exports = { getCodesByRole, collectTokensForCodes, getDriverTokens, getAdminTokens };
