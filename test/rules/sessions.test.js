'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('sessions');
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
    await db.collection('sessions').doc('s1').set({
      code: 'D12', date: '2026-07-21', week: '2026-W30', platform: 'web',
      appVersion: '0.2', createdAt: new Date(),
    });
  });
}

function newSession(overrides) {
  return Object.assign({
    code: 'D12', date: '2026-07-22', week: '2026-W30', platform: 'web',
    appVersion: '0.2', createdAt: new Date(),
  }, overrides);
}

/* ===== create ===== */

test('本人はcodeを一致させてsessionsを作成できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('sessions').add(newSession({})));
});

test('他人のcodeを詐称してsessionsを作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('sessions').add(newSession({ code: 'D99' })));
});

test('未認証ユーザーはsessionsを作成できない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('sessions').add(newSession({})));
});

test('adminも自分のcodeでなら作成できる(なりすまし判定はコード一致のみ)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('sessions').add(newSession({ code: 'ADM1' })));
});

/* ===== read ===== */

test('一般ユーザーはsessionsをread/listできない(集計は管理者専用)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('sessions').get());
});

test('未認証ユーザーはsessionsをreadできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('sessions').doc('s1').get());
});

test('adminはsessionsをlistできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('sessions').get());
});

/* ===== update / delete(常に不可、追記のみ) ===== */

test('本人でもsessionsを更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('sessions').doc('s1').update({ platform: 'ios-pwa' }));
});

test('adminでもsessionsを更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('sessions').doc('s1').update({ platform: 'ios-pwa' }));
});

test('adminでもsessionsを削除できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('sessions').doc('s1').delete());
});
