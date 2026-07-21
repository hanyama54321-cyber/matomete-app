'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('manuals');
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

    await db.collection('manuals').doc('man_1').set({
      title: '配送基本マニュアル', description: '説明', category: '基本手順', icon: '📦',
      fileUrl: 'https://example.com/a.pdf', fileName: 'a.pdf', fileType: 'application/pdf', fileSize: 1000,
      createdAt: new Date(), updatedAt: new Date(),
      uploaderUid: 'ADM1', uploaderName: '管理者一号',
      mustRead: false, readDeadline: null,
    });
    await db.collection('manuals').doc('man_sample').set({
      title: 'サンプル', description: '', category: 'その他', icon: '📋',
      fileUrl: null, fileName: null, fileType: null, fileSize: null,
      createdAt: new Date(), updatedAt: new Date(),
      uploaderUid: null, uploaderName: null,
      mustRead: false, readDeadline: null,
    });
    await db.collection('manuals').doc('man_1').collection('reads').doc('D99').set({
      code: 'D99', name: '鈴木', readAt: new Date(),
    });
  });
}

function newManual(overrides) {
  return Object.assign({
    title: '新規マニュアル', description: '', category: '基本手順', icon: '📦',
    fileUrl: 'https://example.com/b.pdf', fileName: 'b.pdf', fileType: 'application/pdf', fileSize: 2000,
    createdAt: new Date(), updatedAt: new Date(),
    uploaderUid: 'ADM1', uploaderName: '管理者一号',
    mustRead: false, readDeadline: null,
  }, overrides);
}

/* ===== manuals本体: read ===== */

test('署名済みユーザーはmanualsをgetできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('manuals').doc('man_1').get());
});

test('署名済みユーザーはmanualsをlistできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('manuals').get());
});

test('未認証ユーザーはmanualsをgetできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('manuals').doc('man_1').get());
});

/* ===== manuals本体: create/delete/update ===== */

test('adminはmanualsを新規作成できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('manuals').add(newManual({})));
});

test('一般ユーザーはmanualsを新規作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('manuals').add(newManual({})));
});

test('adminはmanualsを削除できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('manuals').doc('man_1').delete());
});

test('一般ユーザーはmanualsを削除できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('manuals').doc('man_1').delete());
});

test('adminはmanualsを更新できる(タイトル修正等)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('manuals').doc('man_1').update({ title: '更新後タイトル' }));
});

test('一般ユーザーはmanualsを更新できない(必読フラグ含め一切不可)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('manuals').doc('man_1').update({ mustRead: true }));
});

/* ===== reads サブコレクション ===== */

test('本人は自分のread記録を作成できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('manuals').doc('man_1').collection('reads').doc('D12').set({
    code: 'D12', name: '佐藤', readAt: new Date(),
  }));
});

test('本人は自分のread記録を更新(再登録)できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertSucceeds(db.collection('manuals').doc('man_1').collection('reads').doc('D99').set({
    code: 'D99', name: '鈴木', readAt: new Date(),
  }));
});

test('他人のread記録は作成できない(なりすまし防止)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('manuals').doc('man_1').collection('reads').doc('D99').set({
    code: 'D99', name: '鈴木', readAt: new Date(),
  }));
});

test('adminであっても他人のread記録は作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('manuals').doc('man_1').collection('reads').doc('D12').set({
    code: 'D12', name: '佐藤', readAt: new Date(),
  }));
});

test('署名済みユーザーはread記録をlist/getできる(既読者一覧の閲覧用)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('manuals').doc('man_1').collection('reads').get());
});

test('一般ユーザーは自分のread記録を削除できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(db.collection('manuals').doc('man_1').collection('reads').doc('D99').delete());
});

test('adminはread記録を削除できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('manuals').doc('man_1').collection('reads').doc('D99').delete());
});
