const crypto = require('crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { REGION, MAX_INSTANCES_CALLABLE } = require('../lib/constants');
const { db, messaging } = require('../lib/admin');

const SUBSCRIBE_WINDOW_MS = 60 * 1000; // 報告作成から60秒以内のみ受付(なりすまし購読対策)

// 匿名報告への回答通知をFCMトピック配信で実現するための購読登録。
// トピック名はここ(Functions側)で生成し、報告IDからは導出しない(推測不可能性の担保)。
// 生成したトピック名はクライアントに一切返さず、ログにもトークン/トピック文字列を出力しない。
exports.subscribeToReport = onCall(
  { region: REGION, maxInstances: MAX_INSTANCES_CALLABLE },
  async (request) => {
    // 認証済みであれば誰でも呼べる(匿名報告の投稿者は一般ドライバーのため管理者限定にはしない)
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '認証が必要です');
    }

    const { reportId, token } = request.data || {};
    if (!reportId || !token) {
      throw new HttpsError('invalid-argument', 'reportId/tokenが必要です');
    }

    const reportRef = db.collection('reports').doc(reportId);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) {
      throw new HttpsError('not-found', '報告が見つかりません');
    }

    const createdAt = reportSnap.data().createdAt;
    if (!createdAt || Date.now() - createdAt.toMillis() > SUBSCRIBE_WINDOW_MS) {
      throw new HttpsError('deadline-exceeded', '購読受付の期限を過ぎています');
    }

    const notifyRef = reportRef.collection('private').doc('notify');
    const notifySnap = await notifyRef.get();
    if (notifySnap.exists) {
      // ネットワークエラー等で保存だけ失敗し再試行された場合もここに来る(実際には購読済み)。
      // クライアント側ではこのエラーをトースト表示せず握りつぶす
      throw new HttpsError('already-exists', 'この報告は既に購読済みです');
    }

    const topic = 'rpt-' + crypto.randomBytes(16).toString('hex');
    await messaging.subscribeToTopic([token], topic);
    await notifyRef.set({ topic });

    console.log('匿名報告の通知購読を登録しました(件数: 1)');
    return { ok: true };
  }
);
