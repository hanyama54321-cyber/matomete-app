const { messaging, db } = require('./admin');

const CHUNK_SIZE = 500; // sendEachForMulticast の1リクエスト上限

// data-onlyメッセージ(notificationフィールドは使わない)を送信し、無効化されたトークンは
// 自動削除する。トークン0件でもエラーにせず正常終了する(Stage0/1では一般ユーザーに
// トークンが存在しないため)。ログにはトークン/トピック文字列を一切出力しない
async function sendDataMessageToTokenRecords(tokenRecords, dataPayload) {
  if (!tokenRecords || tokenRecords.length === 0) {
    console.log('送信対象トークンなし(0件)。正常終了');
    return { sent: 0, cleaned: 0 };
  }

  let sent = 0;
  let cleaned = 0;

  for (let i = 0; i < tokenRecords.length; i += CHUNK_SIZE) {
    const chunk = tokenRecords.slice(i, i + CHUNK_SIZE);
    const res = await messaging.sendEachForMulticast({
      tokens: chunk.map((r) => r.token),
      data: dataPayload,
    });
    sent += res.successCount;

    const cleanups = [];
    res.responses.forEach((r, idx) => {
      if (r.success) return;
      const code = r.error && r.error.code;
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-argument'
      ) {
        const rec = chunk[idx];
        cleanups.push(
          db.collection('users').doc(rec.code).collection('tokens').doc(rec.tokenId).delete()
        );
      }
    });
    if (cleanups.length) {
      await Promise.all(cleanups);
      cleaned += cleanups.length;
    }
  }

  console.log(`送信結果: 成功${sent}件 / 無効トークン削除${cleaned}件`);
  return { sent, cleaned };
}

module.exports = { sendDataMessageToTokenRecords };
