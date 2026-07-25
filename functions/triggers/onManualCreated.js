const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { REGION, MAX_INSTANCES_TRIGGER, NOTIFY_PREF_KEYS } = require('../lib/constants');
const { FieldValue } = require('../lib/admin');
const { getDriverTokens } = require('../lib/tokens');
const { sendDataMessageToTokenRecords } = require('../lib/send');

// 手順書の新規追加を全ドライバーへ通知する。mustReadは問わない(新規追加すべてが対象)
exports.onManualCreated = onDocumentCreated(
  { document: 'manuals/{id}', region: REGION, maxInstances: MAX_INSTANCES_TRIGGER },
  async (event) => {
    const data = event.data.data();
    if (data.notifiedAt) return; // リトライ等による二重実行を防ぐ

    const tokenRecords = await getDriverTokens(NOTIFY_PREF_KEYS.MANUAL_ADDED);
    await sendDataMessageToTokenRecords(tokenRecords, {
      type: 'manualAdded',
      manualId: event.params.id,
      title: (data.title || '').slice(0, 60),
    });

    await event.data.ref.update({ notifiedAt: FieldValue.serverTimestamp() });
  }
);
