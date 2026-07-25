/*
  安全配送 まとめてアプリ — FCM バックグラウンド通知受信専用 Service Worker
  © 2026 南野

  通知受信専用の最小構成。fetchハンドラは書かない(オフラインキャッシュは導入しない)。
  GitHub Pagesのサブパス配信のため、登録側(index.html)で
  navigator.serviceWorker.register('firebase-messaging-sw.js', { scope: '/matomete-app/' })
  のようにscopeを明示すること。
*/

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// SWの内容を実際に変更した回だけ値を上げる(APP_VERSIONとは別系統)
const SW_VERSION = 'sw-1';

// この設定はindex.htmlのfirebaseConfigと同期させること。
// SWはindex.html側の変数を参照できないため、値を変更したら両方直す必要がある
const firebaseConfig = {
  apiKey: "AIzaSyBDEk7luVCDDJooPwG6BU0r1qX8GROc6rY",
  authDomain: "anzen-matomete-app.firebaseapp.com",
  projectId: "anzen-matomete-app",
  storageBucket: "anzen-matomete-app.firebasestorage.app",
  messagingSenderId: "163103621501",
  appId: "1:163103621501:web:53410bbe65778f5d154c14",
  measurementId: "G-FQKRCR30BY"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ロック画面に表示する文言をイベント種別ごとに組み立てる。FCMメッセージはnotification
// フィールドを使わずdata-onlyで送信しているため、この関数がSW側の唯一の文言生成箇所になる。
// 報告関連2件(reportReply/newReportAdmin)は報告内容・回答本文・報告番号・投稿者情報を
// 一切含めない(設計方針9-1)。識別子(reportId等)はdataに残すが表示文字列には使わない
function buildNotificationContent(data) {
  switch (data.type) {
    case 'mustReadAnnouncement':
      return { title: '📢 必読お知らせ', body: `📌 必読: ${data.title || ''}` };
    case 'manualAdded':
      return { title: '📋 手順書の更新', body: `🗂️ 新しい手順書: ${data.title || ''}` };
    case 'unreadReminder':
      return { title: '🔔 未読リマインダー', body: '未読のお知らせがあります' };
    case 'reportReply':
      return { title: '✉️ 報告への回答', body: '新しい回答があります' };
    case 'newReportAdmin':
      return { title: '📩 新着報告', body: '新しい報告が届いています' };
    default:
      return { title: '安全配送まとめてアプリ', body: '新しい通知があります' };
  }
}

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const { title, body } = buildNotificationContent(data);
  self.registration.showNotification(title, {
    body,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = self.registration.scope;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 旧バージョンのSWが張り付くのを防ぐ(iOS standalone PWAはユーザーが完全終了しないことが多いため)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
