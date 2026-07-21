'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

// Storage rules の firestore.get()クロスサービス参照は、ローカルエミュレータでは
// CLIのデフォルトprojectId(.firebasercの値)に対して解決される。他のテストファイルのように
// suffix付きの独自projectIdを使うと、Storage側からは対応するusersドキュメントが見えず
// (Null value error)、isAdmin()判定が常にfalseになってしまうため、ここだけsuffixなしで作成する。
// (このファイル以外はsuffix付きprojectIdを使っているため、並列実行時のFirestore名前空間衝突は無い)
test.before(async () => {
  testEnv = await createTestEnv(null, { storage: true });
});

test.after(async () => {
  await testEnv.cleanup();
});

async function seed() {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('users').doc('D12').set({
      name: '佐藤', team: 'team_e', role: 'driver', passwordChanged: true,
    });
    await db.collection('users').doc('ADM1').set({
      name: '管理者一号', team: null, role: 'admin', passwordChanged: true,
    });
  });
}

// テスト対象のルールが firestore.get() でクロスサービス参照するため、
// firestoreとstorage両エミュレータを同時起動して実行する必要がある(package.jsonのtest:rules参照)。

test('adminはmanualsファイルをアップロードできる', async () => {
  await seed();
  const storage = authedContext(testEnv, 'ADM1').storage();
  await assertSucceeds(storage.ref('manuals/man_1/test.pdf').put(new Uint8Array(10)));
});

test('一般ユーザーはmanualsファイルをアップロードできない', async () => {
  await seed();
  const storage = authedContext(testEnv, 'D12').storage();
  await assertFails(storage.ref('manuals/man_1/test.pdf').put(new Uint8Array(10)));
});

test('未認証ユーザーはmanualsファイルをアップロードできない', async () => {
  await seed();
  const storage = testEnv.unauthenticatedContext().storage();
  await assertFails(storage.ref('manuals/man_1/test.pdf').put(new Uint8Array(10)));
});

test('50MBを超えるファイルはadminでもアップロードできない(誤アップロード防止)', async () => {
  await seed();
  const storage = authedContext(testEnv, 'ADM1').storage();
  const big = new Uint8Array(51 * 1024 * 1024);
  await assertFails(storage.ref('manuals/man_1/big.bin').put(big));
});

test('署名済みユーザーはmanualsファイルをreadできる', async () => {
  await seed();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref('manuals/man_1/test.pdf').put(new Uint8Array(10));
  });
  const storage = authedContext(testEnv, 'D12').storage();
  await assertSucceeds(storage.ref('manuals/man_1/test.pdf').getDownloadURL());
});

test('未認証ユーザーはmanualsファイルをreadできない', async () => {
  await seed();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref('manuals/man_1/test.pdf').put(new Uint8Array(10));
  });
  const storage = testEnv.unauthenticatedContext().storage();
  await assertFails(storage.ref('manuals/man_1/test.pdf').getDownloadURL());
});

test('一般ユーザーはmanualsファイルを削除できない', async () => {
  await seed();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref('manuals/man_1/test.pdf').put(new Uint8Array(10));
  });
  const storage = authedContext(testEnv, 'D12').storage();
  await assertFails(storage.ref('manuals/man_1/test.pdf').delete());
});

test('adminはmanualsファイルを削除できる', async () => {
  await seed();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref('manuals/man_1/test.pdf').put(new Uint8Array(10));
  });
  const storage = authedContext(testEnv, 'ADM1').storage();
  await assertSucceeds(storage.ref('manuals/man_1/test.pdf').delete());
});
