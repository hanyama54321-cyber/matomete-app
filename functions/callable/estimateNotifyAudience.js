const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION, MAX_INSTANCES_CALLABLE } = require('../lib/constants');
const { db } = require('../lib/admin');
const { requireAdmin } = require('../lib/auth');
const { getCodesByRole, collectTokensForCodes } = require('../lib/tokens');

// 送信前確認ダイアログの「概算人数」算出用。管理者限定
// (クライアントはtokens/notifyPrefsを横断集計できないため、Admin SDK側でまとめて数える)。
// 通知許可者数という運用情報を返すため管理者以外には見せない。
// targetType/targetIdが指定された場合(未読リマインダー確認用)は、sendUnreadReminderと同じ
// ロジックで未読者のみに絞り込んでから数える(全ドライバー数を返すと過大表示になるため)
exports.estimateNotifyAudience = onCall(
  { region: REGION, maxInstances: MAX_INSTANCES_CALLABLE },
  async (request) => {
    await requireAdmin(request.auth);

    const { eventKey, role, targetType, targetId } = request.data || {};
    if (!eventKey) throw new HttpsError('invalid-argument', 'eventKeyが必要です');

    let codes = await getCodesByRole(role === 'admin' ? 'admin' : 'driver');

    if (targetType && targetId) {
      const collection = targetType === 'announcement' ? 'announcements' : 'manuals';
      const readsSnap = await db.collection(collection).doc(targetId).collection('reads').get();
      const readCodes = new Set(readsSnap.docs.map((d) => d.id));
      codes = codes.filter((c) => !readCodes.has(c));
    }

    const tokenRecords = await collectTokensForCodes(codes, eventKey);
    const uniqueCodes = new Set(tokenRecords.map((r) => r.code));

    return { ok: true, count: uniqueCodes.size };
  }
);
