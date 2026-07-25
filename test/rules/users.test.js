'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('users-test');
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
    await db.collection('users').doc('ADM2').set({
      name: '管理者二号', team: null, role: 'admin', passwordChanged: true,
    });
  });
}

test('adminは他ユーザーのroleを変更できる(driver→admin)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('users').doc('D12').update({ role: 'admin' }));
});

test('adminは自分自身のroleを変更できない(自己降格防止)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('users').doc('ADM1').update({ role: 'driver' }));
});

test('adminは自分自身の他フィールド(passwordChanged等)は更新できる(role以外)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('users').doc('ADM1').update({ passwordChanged: false }));
});

test('別のadminのroleは変更できる(自己降格防止は自分自身の書き込みのみが対象)', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM2').firestore();
  await assertSucceeds(db.collection('users').doc('ADM1').update({ role: 'driver' }));
});

test('一般ユーザーは自分のpasswordChangedのみ更新できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('users').doc('D12').update({ passwordChanged: true }));
});

test('一般ユーザーは自分のroleを変更できない(本人でもadminへ昇格不可)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('users').doc('D12').update({ role: 'admin' }));
});

test('一般ユーザーは他ユーザーのドキュメントを更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('users').doc('ADM1').update({ passwordChanged: false }));
});

test('一般ユーザーは一覧取得(list)できない(admin専用)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('users').get());
});

test('adminは一覧取得(list)できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('users').get());
});

test('一般ユーザーはユーザーを新規作成できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('users').doc('D77').set({
    name: '新人', team: 'team_e', role: 'driver', passwordChanged: false,
  }));
});

test('adminはユーザーを新規作成できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('users').doc('D77').set({
    name: '新人', team: 'team_e', role: 'driver', passwordChanged: false,
  }));
});

test('一般ユーザーは自分のteamを単独更新できる(所属班の自己変更)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('users').doc('D12').update({ team: 'team_i' }));
});

test('一般ユーザーはteamをホワイトリスト外の値に変更できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('users').doc('D12').update({ team: '本部' }));
});

test('一般ユーザーはteamをnullに変更できない(ホワイトリストにnullは含まない)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('users').doc('D12').update({ team: null }));
});

test('一般ユーザーはteamとroleを同時更新できない(hasOnly([\'team\'])単独のみ許可)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('users').doc('D12').update({ team: 'team_i', role: 'admin' }));
});

test('一般ユーザーは他ユーザーのteamを更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('users').doc('ADM1').update({ team: 'team_i' }));
});

test('一般ユーザーは自分のlastActiveDateを単独更新できる(利用状況計測)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('users').doc('D12').update({ lastActiveDate: '2026-07-22' }));
});

test('一般ユーザーはlastActiveDateと他フィールドを同時更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('users').doc('D12').update({ lastActiveDate: '2026-07-22', team: 'team_i' }));
});

test('一般ユーザーは他ユーザーのlastActiveDateを更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('users').doc('ADM1').update({ lastActiveDate: '2026-07-22' }));
});

test('一般ユーザーは自分のnotifyPrefsを単独更新できる(通知設定)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(
    db.collection('users').doc('D12').update({ notifyPrefs: { mustReadAnnouncement: false } })
  );
});

test('一般ユーザーはnotifyPrefsと他フィールドを同時更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(
    db.collection('users').doc('D12').update({ notifyPrefs: { mustReadAnnouncement: false }, team: 'team_i' })
  );
});

test('一般ユーザーはnotifyPrefsに許可外のキーを含められない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(
    db.collection('users').doc('D12').update({ notifyPrefs: { unknownKey: true } })
  );
});

test('一般ユーザーはnotifyPrefsの値をbool以外にできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(
    db.collection('users').doc('D12').update({ notifyPrefs: { mustReadAnnouncement: 'yes' } })
  );
});

test('一般ユーザーは他ユーザーのnotifyPrefsを更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(
    db.collection('users').doc('ADM1').update({ notifyPrefs: { mustReadAnnouncement: false } })
  );
});

test('adminは対象ユーザーのnotifyPrefsを含む任意更新ができる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(
    db.collection('users').doc('D12').update({ notifyPrefs: { mustReadAnnouncement: false }, team: 'team_i' })
  );
});
