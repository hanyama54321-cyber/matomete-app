const { onSchedule } = require('firebase-functions/v2/scheduler');
const { REGION, MAX_INSTANCES_SCHEDULED, STALE_TOKEN_DAYS } = require('../lib/constants');
const { db } = require('../lib/admin');

// FCMトークンは永続的な識別子ではなく、長期未使用のものはGoogle側でも無効化されうる。
// 放置すると無効トークンへの送信が積み上がるため、週次で古いトークンを削除する
exports.cleanupStaleTokens = onSchedule(
  {
    // 標準unix-cron形式。毎週日曜3:00(JST)に実行(「every 7 days」は
    // Cloud Schedulerに認識されず400エラーになったため標準cron式に変更)
    schedule: '0 3 * * 0',
    region: REGION,
    maxInstances: MAX_INSTANCES_SCHEDULED,
    timeZone: 'Asia/Tokyo',
  },
  async () => {
    const cutoff = new Date(Date.now() - STALE_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    const snap = await db.collectionGroup('tokens').where('lastSeenAt', '<', cutoff).get();

    if (snap.empty) {
      console.log('掃除対象の長期未使用トークンなし');
      return;
    }

    await Promise.all(snap.docs.map((d) => d.ref.delete()));
    console.log(`長期未使用トークンを削除しました(件数: ${snap.docs.length})`);
  }
);
