'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('config');
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
    await db.collection('users').doc('ADM1').set({
      name: '管理者一号', team: null, role: 'admin', passwordChanged: true,
    });
    await db.collection('config').doc('notifications').set({ openToAllUsers: false });
  });
}

test('認証済み一般ユーザーはconfig/notificationsをreadできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('config').doc('notifications').get());
});

test('未認証ユーザーはconfig/notificationsをreadできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('config').doc('notifications').get());
});

test('adminはconfig/notificationsをwriteできる(Stage2移行操作)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(
    db.collection('config').doc('notifications').update({ openToAllUsers: true })
  );
});

test('一般ユーザーはconfig/notificationsをwriteできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(
    db.collection('config').doc('notifications').update({ openToAllUsers: true })
  );
});
