const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { REGION, MAX_INSTANCES_TRIGGER, NOTIFY_PREF_KEYS } = require('../lib/constants');
const { FieldValue } = require('../lib/admin');
const { getDriverTokens } = require('../lib/tokens');
const { sendDataMessageToTokenRecords } = require('../lib/send');
const { diffIsOnly } = require('../lib/idempotency');

// 必読お知らせの投稿(作成)・予約下書きの後追い公開(更新、confirmPublishNow()経由)の
// どちらもこの1関数でカバーする。onDocumentWrittenはcreate/update/deleteすべてで発火する。
exports.onAnnouncementNotify = onDocumentWritten(
  { document: 'announcements/{id}', region: REGION, maxInstances: MAX_INSTANCES_TRIGGER },
  async (event) => {
    // 1. 削除イベント(afterが存在しない)は対象外。ここを弾かないとafter.data()参照で例外になる
    if (!event.data.after.exists) return;

    const before = event.data.before.exists ? event.data.before.data() : null;
    const after = event.data.after.data();

    // 2. 自分自身が直前に書き込んだnotifiedAtの反響は無視する(自己再帰防止)。
    //    beforeが存在しない(新規作成)場合はdiffIsOnlyがfalseを返すため3へ進む
    if (before && diffIsOnly(before, after, ['notifiedAt'])) return;

    // 3. 送信条件: 公開済み × 必読 × 未送信(作成時・後追い公開時のどちらでも成立する)
    if (after.status !== 'published' || after.mustRead !== true || after.notifiedAt) return;

    const tokenRecords = await getDriverTokens(NOTIFY_PREF_KEYS.MUST_READ_ANNOUNCEMENT);

    // 送信 → notifiedAt書き込みの順序。書き込み前に落ちてリトライされると二重送信のリスクは
    // あるが、必読お知らせが届かない(取りこぼし)ほうが実害が大きいため許容する。
    // (onReportReplyNotifyのconsumedIntentAt書き込みも同じ理由・同じ順序)
    await sendDataMessageToTokenRecords(tokenRecords, {
      type: 'mustReadAnnouncement',
      announcementId: event.params.id,
      title: (after.title || '').slice(0, 60),
    });

    await event.data.after.ref.update({ notifiedAt: FieldValue.serverTimestamp() });
  }
);
