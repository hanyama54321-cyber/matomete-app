const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION, MAX_INSTANCES_CALLABLE, NOTIFY_PREF_KEYS } = require('../lib/constants');
const { db } = require('../lib/admin');
const { requireAdmin } = require('../lib/auth');
const { getCodesByRole, collectTokensForCodes } = require('../lib/tokens');
const { sendDataMessageToTokenRecords } = require('../lib/send');

// 管理者限定。未読者(全ドライバー − readsサブコレクション既読者)にのみ送信する。
// ロック画面文言は「未読のお知らせがあります」固定(対象物の名前は含めない)
exports.sendUnreadReminder = onCall(
  { region: REGION, maxInstances: MAX_INSTANCES_CALLABLE },
  async (request) => {
    await requireAdmin(request.auth);

    const { targetType, targetId } = request.data || {};
    if (!['announcement', 'manual'].includes(targetType) || !targetId) {
      throw new HttpsError('invalid-argument', 'targetType/targetIdが不正です');
    }
    const collection = targetType === 'announcement' ? 'announcements' : 'manuals';

    const driverCodes = await getCodesByRole('driver');
    const readsSnap = await db.collection(collection).doc(targetId).collection('reads').get();
    const readCodes = new Set(readsSnap.docs.map((d) => d.id));
    const unreadCodes = driverCodes.filter((c) => !readCodes.has(c));

    const tokenRecords = await collectTokensForCodes(unreadCodes, NOTIFY_PREF_KEYS.UNREAD_REMINDER);
    const result = await sendDataMessageToTokenRecords(tokenRecords, {
      type: 'unreadReminder',
      targetType,
      targetId,
    });

    return { ok: true, unreadCount: unreadCodes.length, sent: result.sent };
  }
);
