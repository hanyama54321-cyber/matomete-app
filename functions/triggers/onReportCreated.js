const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { REGION, MAX_INSTANCES_TRIGGER, NOTIFY_PREF_KEYS } = require('../lib/constants');
const { FieldValue } = require('../lib/admin');
const { getAdminTokens } = require('../lib/tokens');
const { sendDataMessageToTokenRecords } = require('../lib/send');

// 新規報告(匿名・記名問わず)を全管理者へ通知する。作成時のみのトリガーのため
// reports本体へのnotifiedAt書き込みはこの関数自身を再トリガーしない
exports.onReportCreated = onDocumentCreated(
  { document: 'reports/{id}', region: REGION, maxInstances: MAX_INSTANCES_TRIGGER },
  async (event) => {
    const data = event.data.data();
    if (data.notifiedAt) return; // リトライ等による二重実行を防ぐ

    const tokenRecords = await getAdminTokens(NOTIFY_PREF_KEYS.NEW_REPORT_ADMIN);
    await sendDataMessageToTokenRecords(tokenRecords, {
      type: 'newReportAdmin',
      reportId: event.params.id,
    });

    await event.data.ref.update({ notifiedAt: FieldValue.serverTimestamp() });
  }
);
