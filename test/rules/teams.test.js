'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('teams-test');
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
    await db.collection('teams').doc('team_e').set({
      code: 'E', leaderName: '佐藤', label: '佐藤班', displayName: 'E班（佐藤班）', order: 5, active: true,
    });
  });
}

test('未認証ユーザーはteamsを読み取れない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('teams').doc('team_e').get());
});

test('driverはteamsを読み取れる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('teams').doc('team_e').get());
});

test('driverはteamsを更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('teams').doc('team_e').update({ leaderName: '偽班長' }));
});

test('adminはteamsを更新できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('teams').doc('team_e').update({
    leaderName: '新田', label: '新田班', displayName: 'E班（新田班）',
  }));
});
