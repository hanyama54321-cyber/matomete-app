'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('announcements');
});

test.after(async () => {
  await testEnv.cleanup();
});

async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('users').doc('D12').set({
      name: '佐藤', team: 'team_e', role: 'driver', passwordChanged: true,
    });
    await db.collection('users').doc('D99').set({
      name: '鈴木', team: 'team_e', role: 'driver', passwordChanged: true,
    });
    await db.collection('users').doc('ADM1').set({
      name: '管理者一号', team: null, role: 'admin', passwordChanged: true,
    });

    await db.collection('announcements').doc('ann_1').set({
      title: '暑熱対策のお願い', body: '本文', category: 'safety', priority: 'high',
      target: 'all', pinned: false, mustRead: true, readDeadline: null, tags: [],
      status: 'published', scheduledAt: null,
      authorUid: 'ADM1', authorName: '管理者一号',
      createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date(),
    });
    await db.collection('announcements').doc('ann_1').collection('reads').doc('D99').set({
      code: 'D99', name: '鈴木', readAt: new Date(), acked: false, ackedAt: null,
    });
  });
}

function newAnnouncement(overrides) {
  return Object.assign({
    title: '新規お知らせ', body: '本文', category: 'work', priority: 'normal',
    target: 'all', pinned: false, mustRead: false, readDeadline: null, tags: [],
    status: 'published', scheduledAt: null,
    authorUid: 'ADM1', authorName: '管理者一号',
    createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date(),
  }, overrides);
}

/* ===== announcements本体: read ===== */

test('署名済みユーザーはannouncementsをgetできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('announcements').doc('ann_1').get());
});

test('署名済みユーザーはannouncementsをlistできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('announcements').get());
});

test('未認証ユーザーはannouncementsをgetできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('announcements').doc('ann_1').get());
});

/* ===== announcements本体: create/update/delete ===== */

test('adminはannouncementsを新規作成できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('announcements').add(newAnnouncement({})));
});

test('一般ユーザーはannouncementsを新規作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('announcements').add(newAnnouncement({})));
});

test('adminはannouncementsを更新できる(編集・今すぐ配信等)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('announcements').doc('ann_1').update({ title: '更新後タイトル' }));
});

test('一般ユーザーはannouncementsを更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('announcements').doc('ann_1').update({ title: '改ざん' }));
});

test('adminはannouncementsを削除できる(物理削除)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('announcements').doc('ann_1').delete());
});

test('一般ユーザーはannouncementsを削除できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('announcements').doc('ann_1').delete());
});

/* ===== reads サブコレクション(既読・必読確認) ===== */

test('本人は自分のread記録を作成できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('announcements').doc('ann_1').collection('reads').doc('D12').set({
    code: 'D12', name: '佐藤', readAt: new Date(), acked: false, ackedAt: null,
  }));
});

test('本人は自分のread記録を更新(必読確認)できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertSucceeds(db.collection('announcements').doc('ann_1').collection('reads').doc('D99').update({
    acked: true, ackedAt: new Date(),
  }));
});

test('他人のread記録は作成できない(なりすまし防止)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('announcements').doc('ann_1').collection('reads').doc('D99').set({
    code: 'D99', name: '鈴木', readAt: new Date(), acked: false, ackedAt: null,
  }));
});

test('adminであっても他人のread記録は作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('announcements').doc('ann_1').collection('reads').doc('D12').set({
    code: 'D12', name: '佐藤', readAt: new Date(), acked: false, ackedAt: null,
  }));
});

test('署名済みユーザーはread記録をlist/getできる(既読者一覧の閲覧用)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('announcements').doc('ann_1').collection('reads').get());
});

test('一般ユーザーは自分のread記録を削除できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(db.collection('announcements').doc('ann_1').collection('reads').doc('D99').delete());
});

test('adminはread記録を削除できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('announcements').doc('ann_1').collection('reads').doc('D99').delete());
});

/* ===== v0.5 images(任意・最大3件) ===== */

const imgEntry = (i) => ({ url: 'https://example.invalid/' + i + '.jpg', path: 'announcements/x/' + i + '.jpg', w: 1600, h: 1200 });

test('adminはimagesが3件のお知らせを作成できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('announcements').doc('img3').set(newAnnouncement({ images: [imgEntry(1), imgEntry(2), imgEntry(3)] })));
});

test('adminでもimagesが4件のお知らせは作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('announcements').doc('img4').set(newAnnouncement({ images: [imgEntry(1), imgEntry(2), imgEntry(3), imgEntry(4)] })));
});

test('adminでもimagesを4件に増やす更新はできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('announcements').doc('ann_1').update({ images: [imgEntry(1), imgEntry(2), imgEntry(3), imgEntry(4)] }));
});

test('adminでもimagesが配列でないお知らせは作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('announcements').doc('imgx').set(newAnnouncement({ images: 'x' })));
});

test('imagesを持たないお知らせは従来どおりadminが作成・更新できる(一括投稿ツール相当)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('announcements').doc('noimg').set(newAnnouncement({})));
  await assertSucceeds(db.collection('announcements').doc('ann_1').update({ title: '変更', updatedAt: new Date() }));
});

test('一般ユーザーはimages付きのお知らせを作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('announcements').doc('img1').set(newAnnouncement({ images: [imgEntry(1)] })));
});
