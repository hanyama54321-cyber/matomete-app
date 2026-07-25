'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('tokens');
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
    await db.collection('users').doc('D12').collection('tokens').doc('hash1').set({
      token: 'dummy-token-d12', platform: 'ios-pwa', ua: 'test-ua',
      createdAt: new Date(), lastSeenAt: new Date(),
    });
  });
}

/* ===== 本人 ===== */

test('本人は自分のtokensを作成できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(
    db.collection('users').doc('D12').collection('tokens').doc('hash2').set({
      token: 'dummy-token-2', platform: 'web', ua: 'test', createdAt: new Date(), lastSeenAt: new Date(),
    })
  );
});

test('本人は自分のtokensをreadできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('users').doc('D12').collection('tokens').doc('hash1').get());
});

test('本人は自分のtokensをupdateできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(
    db.collection('users').doc('D12').collection('tokens').doc('hash1').update({ lastSeenAt: new Date() })
  );
});

test('本人は自分のtokensをdeleteできる(ログアウト時)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('users').doc('D12').collection('tokens').doc('hash1').delete());
});

/* ===== 他人・admin・未認証 ===== */

test('他人のtokensはread不可', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(db.collection('users').doc('D12').collection('tokens').doc('hash1').get());
});

test('他人のtokensはwrite不可', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(
    db.collection('users').doc('D12').collection('tokens').doc('hash1').update({ lastSeenAt: new Date() })
  );
});

test('adminであっても他人のtokensはread不可(クライアントとしてはAdmin SDK専用)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('users').doc('D12').collection('tokens').doc('hash1').get());
});

test('adminであっても他人のtokensをlistできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('users').doc('D12').collection('tokens').get());
});

test('未認証ユーザーはtokensをread/writeできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('users').doc('D12').collection('tokens').doc('hash1').get());
  await assertFails(
    db.collection('users').doc('D12').collection('tokens').doc('hash1').set({ token: 'x' })
  );
});
