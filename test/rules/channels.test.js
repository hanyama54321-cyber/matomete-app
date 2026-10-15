'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('channels-test');
});

test.after(async () => {
  await testEnv.cleanup();
});

async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('users').doc('D12').set({
      name: '佐藤', team: 'team_a', role: 'driver', passwordChanged: true,
    });
    await db.collection('users').doc('D99').set({
      name: '鈴木', team: 'team_b', role: 'driver', passwordChanged: true,
    });
    await db.collection('users').doc('ADM1').set({
      name: '管理者一号', team: null, role: 'admin', passwordChanged: true,
    });

    await db.collection('channels').doc('general').set({
      teamId: 'all', name: '全体連絡', lastMessage: null, createdAt: new Date().toISOString(),
    });
    await db.collection('channels').doc('team_a').set({
      teamId: 'team_a', name: 'A班', lastMessage: null, createdAt: new Date().toISOString(),
    });
    await db.collection('channels').doc('team_b').set({
      teamId: 'team_b', name: 'B班', lastMessage: null, createdAt: new Date().toISOString(),
    });
    await db.collection('channels').doc('team_a').collection('messages').doc('m1').set({
      senderUid: 'D12', senderName: '佐藤', senderRole: 'driver', text: 'こんにちは',
      createdAt: new Date(), deleted: false, deletedBy: null, deletedAt: null,
    });

    // v0.4.8 管理者班(team_i)。所属班が team_i の乗務員(移行前のデータを想定)も用意する
    await db.collection('users').doc('D50').set({
      name: '高橋', team: 'team_i', role: 'driver', passwordChanged: true,
    });
    await db.collection('channels').doc('team_i').set({
      teamId: 'team_i', name: '管理者班', lastMessage: { createdAt: new Date() }, createdAt: new Date().toISOString(),
    });
    await db.collection('channels').doc('team_i').collection('messages').doc('a1').set({
      senderUid: 'ADM1', senderName: '管理者一号', senderRole: 'admin', text: '管理者のみ',
      createdAt: new Date(), deleted: false, deletedBy: null, deletedAt: null,
    });
  });
}

function newMessage(overrides) {
  return Object.assign({
    senderUid: 'D12', senderName: '佐藤', senderRole: 'driver', text: 'テスト',
    createdAt: new Date(), deleted: false, deletedBy: null, deletedAt: null,
  }, overrides);
}

/* ===== channels本体: get/list(v0.2で全員に開放) ===== */

test('未認証ユーザーはchannelをgetできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('channels').doc('team_a').get());
});

test('driverは自班のchannelをgetできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('channels').doc('team_a').get());
});

test('driverは他班のchannelもgetできる(v0.2: 閲覧は全員に開放)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('channels').doc('team_b').get());
});

test('driverはchannels一覧をlistできる(v0.2)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('channels').get());
});

/* ===== messages: read(v0.2で全員に開放) / create(所属班+adminのまま) ===== */

test('driverは自班のmessagesをreadできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('channels').doc('team_a').collection('messages').get());
});

test('driverは他班のmessagesもreadできる(v0.2: 閲覧は全員に開放)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertSucceeds(db.collection('channels').doc('team_a').collection('messages').get());
});

test('driverは自班のmessagesをcreateできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('channels').doc('team_a').collection('messages').add(newMessage({})));
});

test('driverはgeneralチャンネルにmessagesをcreateできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('channels').doc('general').collection('messages').add(newMessage({})));
});

test('driverは他班のmessagesをcreateできない(書き込みは所属班のみ、v0.2でも変更なし)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(db.collection('channels').doc('team_a').collection('messages').add(
    newMessage({ senderUid: 'D99', senderName: '鈴木' })
  ));
});

test('adminは全チャンネルでmessagesをreadできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('channels').doc('team_a').collection('messages').get());
});

test('adminは全チャンネルにmessagesをcreateできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('channels').doc('team_b').collection('messages').add(
    newMessage({ senderUid: 'ADM1', senderName: '管理者一号', senderRole: 'admin' })
  ));
});

test('未認証ユーザーはmessagesをreadできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('channels').doc('team_a').collection('messages').get());
});

/* ===== v0.4.8 管理者班(team_i): 閲覧・投稿とも admin のみ ===== */

const adminRoomMsgs = (db) => db.collection('channels').doc('team_i').collection('messages');
const adminMsg = () => newMessage({ senderUid: 'ADM1', senderName: '管理者一号', senderRole: 'admin' });

test('driver(所属班team_a)は管理者班のmessagesをreadできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(adminRoomMsgs(db).get());
  await assertFails(adminRoomMsgs(db).doc('a1').get());
});

test('driver(所属班がteam_i)でも管理者班のmessagesをreadできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D50').firestore();
  await assertFails(adminRoomMsgs(db).get());
  await assertFails(adminRoomMsgs(db).doc('a1').get());
});

test('driver(所属班team_a)は管理者班にmessagesをcreateできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(adminRoomMsgs(db).add(newMessage({})));
});

test('driver(所属班がteam_i)でも管理者班にmessagesをcreateできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D50').firestore();
  await assertFails(adminRoomMsgs(db).add(newMessage({ senderUid: 'D50', senderName: '高橋' })));
});

test('driverは管理者班のlastMessageをupdateできない(createdAtのみでも不可)', async () => {
  await seed();
  for (const code of ['D12', 'D50']) {
    const db = authedContext(testEnv, code).firestore();
    await assertFails(db.collection('channels').doc('team_i').update({ lastMessage: { createdAt: new Date() } }));
  }
});

test('adminは管理者班のmessagesをread・createできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(adminRoomMsgs(db).get());
  await assertSucceeds(adminRoomMsgs(db).add(adminMsg()));
});

test('adminは管理者班のmessagesをソフト削除できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(adminRoomMsgs(db).doc('a1').update({ deleted: true, deletedBy: 'ADM1', deletedAt: new Date() }));
});

test('adminは管理者班のlastMessageをcreatedAtのみで更新できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('channels').doc('team_i').update({ lastMessage: { createdAt: new Date() } }));
});

test('adminでも管理者班のlastMessageにtext/senderNameを含めた更新は拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(db.collection('channels').doc('team_i').update({ lastMessage: { text: '本文', createdAt: new Date() } }));
  await assertFails(db.collection('channels').doc('team_i').update({ lastMessage: { senderName: '管理者一号', createdAt: new Date() } }));
});

test('adminは他チャンネルのlastMessageを従来どおりtext付きで更新できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('channels').doc('team_b').update({ lastMessage: { text: '本文', senderName: '管理者一号', createdAt: new Date() } }));
});

test('driverは自班・generalのlastMessageを従来どおりtext付きで更新できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('channels').doc('team_a').update({ lastMessage: { text: '本文', senderName: '佐藤', createdAt: new Date() } }));
  await assertSucceeds(db.collection('channels').doc('general').update({ lastMessage: { text: '本文', senderName: '佐藤', createdAt: new Date() } }));
});

test('driverは管理者班を含むchannels一覧を引き続きlist・getできる(一覧購読が壊れない)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('channels').get());
  await assertSucceeds(db.collection('channels').doc('team_i').get());
});
