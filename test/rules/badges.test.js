'use strict';
const test = require('node:test');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('badges');
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
    await db.collection('users').doc('D12').collection('state').doc('badges').set({
      since: new Date('2026-07-29T00:00:00+09:00'),
      reportsSeenAt: new Date('2026-07-29T00:00:00+09:00'),
      kytSeenAt: new Date('2026-07-29T00:00:00+09:00'),
      chat: { general: new Date('2026-07-29T00:00:00+09:00') },
    });
  });
}

function badgesRef(db, code) {
  return db.collection('users').doc(code).collection('state').doc('badges');
}

/* ===== 本人 ===== */

test('本人は自分のstate/badgesをreadできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(badgesRef(db, 'D12').get());
});

test('本人は自分のstate/badgesを新規作成できる(初回の移行処理)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertSucceeds(badgesRef(db, 'D99').set({
    since: new Date(), reportsSeenAt: new Date(), kytSeenAt: new Date(), chat: { general: new Date() },
  }));
});

test('本人は自分のstate/badgesを更新できる(最終閲覧時刻の記録)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(badgesRef(db, 'D12').set({ reportsSeenAt: new Date() }, { merge: true }));
});

test('本人はchatのチャンネル別時刻を部分更新できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(
    badgesRef(db, 'D12').set({ chat: { team_e: new Date() } }, { merge: true })
  );
});

// flushBadgeSeen() は 'chat.<id>' を { chat: { <id>: ts } } に組み直して
// set(..., {merge:true}) で書き込む。この方式が他チャンネルの値を壊さないことを固定する
// (ドット付きキーのまま渡すとリテラル名のフィールドになり、読み出し側と噛み合わない)
test('chatのネスト部分更新は他チャンネルの値を壊さない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  const teamTime = new Date('2026-08-01T09:00:00+09:00');
  await assertSucceeds(
    badgesRef(db, 'D12').set({ chat: { team_e: teamTime } }, { merge: true })
  );
  const snap = await badgesRef(db, 'D12').get();
  const chat = snap.data().chat;
  // 既存の general が残っており、かつ team_e が新しい値で入っている
  if (!chat.general) throw new Error('merge:trueで既存チャンネル(general)が失われた');
  if (chat.team_e.toDate().getTime() !== teamTime.getTime()) {
    throw new Error('team_eが期待した時刻で書き込まれていない');
  }
  // ドットを含むリテラルなフィールド名が作られていないこと
  if (Object.keys(snap.data()).some(k => k.includes('.'))) {
    throw new Error('ドット付きのリテラルフィールドが作られている');
  }
});

/* ===== 他人・admin・未認証 ===== */

test('他人のstate/badgesはreadできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(badgesRef(db, 'D12').get());
});

test('他人のstate/badgesはwriteできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(badgesRef(db, 'D12').set({ reportsSeenAt: new Date() }, { merge: true }));
});

test('adminであっても他人のstate/badgesはreadできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(badgesRef(db, 'D12').get());
});

test('adminであっても他人のstate/badgesはwriteできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertFails(badgesRef(db, 'D12').set({ reportsSeenAt: new Date() }, { merge: true }));
});

test('未認証ユーザーはstate/badgesをread/writeできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(badgesRef(db, 'D12').get());
  await assertFails(badgesRef(db, 'D12').set({ reportsSeenAt: new Date() }, { merge: true }));
});

test('state配下の別ドキュメントも本人のみ・他人は不可', async () => {
  await seed();
  const own = authedContext(testEnv, 'D12').firestore();
  const other = authedContext(testEnv, 'D99').firestore();
  await assertSucceeds(own.collection('users').doc('D12').collection('state').doc('other').set({ x: 1 }));
  await assertFails(other.collection('users').doc('D12').collection('state').doc('other').get());
});
