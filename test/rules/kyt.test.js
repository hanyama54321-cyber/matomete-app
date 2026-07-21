'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('kyt');
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

    await db.collection('kyt').doc('kyt_1').set({
      title: 'シナリオ1', desc: '説明', img: '🏪', difficulty: '高',
      hints: ['危険A', '危険B', '危険C'],
      createdAt: new Date(), updatedAt: new Date(),
    });
    await db.collection('kyt').doc('kyt_1').collection('completions').doc('D99').set({
      code: 'D99', name: '鈴木', score: 2, total: 3, completedAt: new Date(),
    });
  });
}

function newScenario(overrides) {
  return Object.assign({
    title: '新規シナリオ', desc: '説明', img: '🚙', difficulty: '中',
    hints: ['危険X', '危険Y', '危険Z'],
    createdAt: new Date(), updatedAt: new Date(),
  }, overrides);
}

/* ===== kyt本体: read ===== */

test('署名済みユーザーはkytをgetできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('kyt').doc('kyt_1').get());
});

test('署名済みユーザーはkytをlistできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('kyt').get());
});

test('未認証ユーザーはkytをgetできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('kyt').doc('kyt_1').get());
});

/* ===== kyt本体: create/update/delete ===== */

test('adminはkytを新規作成できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('kyt').add(newScenario({})));
});

test('一般ユーザーはkytを新規作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('kyt').add(newScenario({})));
});

test('adminはkytを更新できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('kyt').doc('kyt_1').update({ title: '更新後タイトル' }));
});

test('一般ユーザーはkytを更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('kyt').doc('kyt_1').update({ title: '改ざん' }));
});

test('adminはkytを削除できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('kyt').doc('kyt_1').delete());
});

test('一般ユーザーはkytを削除できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('kyt').doc('kyt_1').delete());
});

/* ===== completions サブコレクション ===== */

test('本人は自分の完了記録を作成できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('kyt').doc('kyt_1').collection('completions').doc('D12').set({
    code: 'D12', name: '佐藤', score: 3, total: 3, completedAt: new Date(),
  }));
});

test('本人は自分の完了記録を更新(再挑戦の上書き)できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertSucceeds(db.collection('kyt').doc('kyt_1').collection('completions').doc('D99').set({
    code: 'D99', name: '鈴木', score: 3, total: 3, completedAt: new Date(),
  }));
});

test('他人の完了記録は作成できない(ドキュメントIDのなりすまし防止)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('kyt').doc('kyt_1').collection('completions').doc('D99').set({
    code: 'D99', name: '鈴木', score: 3, total: 3, completedAt: new Date(),
  }));
});

test('codeフィールドが自分と異なると作成できない(フィールド偽装防止)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('kyt').doc('kyt_1').collection('completions').doc('D12').set({
    code: 'D99', name: '佐藤', score: 3, total: 3, completedAt: new Date(),
  }));
});

test('adminであっても他人の完了記録は作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('kyt').doc('kyt_1').collection('completions').doc('D12').set({
    code: 'D12', name: '佐藤', score: 3, total: 3, completedAt: new Date(),
  }));
});

test('署名済みユーザーは完了記録をlist/getできる(集計用)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('kyt').doc('kyt_1').collection('completions').get());
});

test('一般ユーザーは自分の完了記録を削除できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(db.collection('kyt').doc('kyt_1').collection('completions').doc('D99').delete());
});

test('adminは完了記録を削除できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('kyt').doc('kyt_1').collection('completions').doc('D99').delete());
});

/* ===== スコア妥当性 ===== */

test('scoreが負の値だと拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('kyt').doc('kyt_1').collection('completions').doc('D12').set({
    code: 'D12', name: '佐藤', score: -1, total: 3, completedAt: new Date(),
  }));
});

test('scoreがtotalを超えると拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('kyt').doc('kyt_1').collection('completions').doc('D12').set({
    code: 'D12', name: '佐藤', score: 4, total: 3, completedAt: new Date(),
  }));
});

test('score===total(満点、境界値)は許可される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('kyt').doc('kyt_1').collection('completions').doc('D12').set({
    code: 'D12', name: '佐藤', score: 3, total: 3, completedAt: new Date(),
  }));
});

test('score===0(境界値)は許可される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('kyt').doc('kyt_1').collection('completions').doc('D12').set({
    code: 'D12', name: '佐藤', score: 0, total: 3, completedAt: new Date(),
  }));
});
