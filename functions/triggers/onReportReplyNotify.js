const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { REGION, MAX_INSTANCES_TRIGGER, NOTIFY_PREF_KEYS } = require('../lib/constants');
const { db, messaging } = require('../lib/admin');
const { collectTokensForCodes } = require('../lib/tokens');
const { sendDataMessageToTokenRecords } = require('../lib/send');

// 報告への回答通知。saveReply()が管理者の「通知して保存」チェックにより
// reports/{id}.replyNotifyIntentAt へタイムスタンプを書き込んだときだけ送信する
// (「通知せず保存」の場合はreplyNotifyIntentAtがnullのまま=送信条件を満たさない)。
// ロック画面文言は「新しい回答があります」の固定文言のみで、報告内容・回答本文・
// カテゴリ・報告番号・投稿者情報は一切含めない(data-only送信、SW側で文言を組み立てる)。
//
// この関数はreports/{id}本体を一切書き込まず、reports/{id}/private/replyNotify という
// 別ドキュメントにのみ書き込む。そのため、このonDocumentUpdated('reports/{id}')トリガー
// 自身を再トリガーしない(自己再帰なし)。
exports.onReportReplyNotify = onDocumentUpdated(
  { document: 'reports/{id}', region: REGION, maxInstances: MAX_INSTANCES_TRIGGER },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    if (!after.replyNotifyIntentAt) return; // 「通知せず保存」、または回答以外の更新
    const beforeIntent = before.replyNotifyIntentAt;
    const changed = !beforeIntent || !beforeIntent.isEqual(after.replyNotifyIntentAt);
    if (!changed) return; // replyNotifyIntentAtに関係しない他フィールドの更新

    const reportId = event.params.id;
    const privateRef = db.collection('reports').doc(reportId).collection('private').doc('replyNotify');
    const privateSnap = await privateRef.get();
    const consumedIntentAt = privateSnap.exists ? privateSnap.data().consumedIntentAt : null;
    if (consumedIntentAt && consumedIntentAt.isEqual(after.replyNotifyIntentAt)) return; // 消化済み(リトライ)

    if (after.anonymous === true) {
      const notifySnap = await db
        .collection('reports')
        .doc(reportId)
        .collection('private')
        .doc('notify')
        .get();
      if (!notifySnap.exists) return; // 匿名投稿者が通知許可端末を持たず購読していない

      const topic = notifySnap.data().topic;
      try {
        await messaging.send({ topic, data: { type: 'reportReply', reportId } });
      } catch (e) {
        console.error('匿名報告への回答通知の送信に失敗しました(トピック配信)');
        return; // 送信できなかった場合はconsumedIntentAtを進めず、次回リトライに委ねる
      }
    } else {
      const submitterCode = after.submitterUid;
      if (!submitterCode) return;
      const tokenRecords = await collectTokensForCodes([submitterCode], NOTIFY_PREF_KEYS.REPORT_REPLY);
      await sendDataMessageToTokenRecords(tokenRecords, { type: 'reportReply', reportId });
    }

    // 送信 → consumedIntentAt書き込みの順序。書き込み前に落ちてリトライされると二重送信の
    // リスクがあるが、回答通知は取りこぼしのほうが痛いためこの順序を採用する
    // (onAnnouncementNotifyのnotifiedAt書き込みと同じ理由・同じ選択)
    await privateRef.set({ consumedIntentAt: after.replyNotifyIntentAt }, { merge: true });
  }
);
