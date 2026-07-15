'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { createTestEnv, authedContext } = require('./helpers');

let testEnv;

test.before(async () => {
  testEnv = await createTestEnv('reports-test');
});

test.after(async () => {
  await testEnv.cleanup();
});

// 各テスト前にusers/reports/countersの初期データを投入する(ルールを無視して直接書き込み)
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

    await db.collection('reports').doc('rep_named').set({
      category: '安全に関する報告', body: '本文A', anonymous: false,
      submitterUid: 'D12', submitterName: '佐藤', submitterTeam: 'E班（佐藤班）',
      createdAt: new Date(), status: 'open',
      assigneeUid: null, assigneeName: null,
      internalNote: '', replyToReporter: '',
      visibility: 'private', statusUpdatedAt: null,
    });
    await db.collection('reports').doc('rep_anon').set({
      category: '業務改善提案', body: '本文B', anonymous: true,
      submitterUid: null, submitterName: null, submitterTeam: null,
      createdAt: new Date(), status: 'open',
      assigneeUid: null, assigneeName: null,
      internalNote: '', replyToReporter: '',
      visibility: 'private', statusUpdatedAt: null,
    });
    await db.collection('reports').doc('rep_public').set({
      category: '設備・車両不具合', body: '本文C', anonymous: false,
      submitterUid: 'D99', submitterName: '鈴木', submitterTeam: 'E班（佐藤班）',
      createdAt: new Date(), status: 'resolved',
      assigneeUid: 'ADM1', assigneeName: '管理者一号',
      internalNote: '内部メモ', replyToReporter: '対応しました',
      visibility: 'public', statusUpdatedAt: new Date(),
    });
    await db.collection('reports').doc('rep_pending_public').set({
      category: 'その他', body: '本文D', anonymous: false,
      submitterUid: 'D12', submitterName: '佐藤', submitterTeam: 'E班（佐藤班）',
      createdAt: new Date(), status: 'open',
      assigneeUid: null, assigneeName: null,
      internalNote: '', replyToReporter: '',
      visibility: 'pending_public', statusUpdatedAt: null,
    });

    await db.collection('counters').doc('reports').set({ count: 5 });
  });
}

/* ===== get / list ===== */

test('本人は自分の非公開・記名報告をgetできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('reports').doc('rep_named').get());
});

test('他人の非公開・記名報告はgetできない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(db.collection('reports').doc('rep_named').get());
});

test('未認証ユーザーは報告をgetできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('reports').doc('rep_named').get());
});

test('匿名報告はIDを知っていれば誰でもgetできる(本人以外でも可)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertSucceeds(db.collection('reports').doc('rep_anon').get());
});

test('adminは他人の非公開報告もgetできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('reports').doc('rep_named').get());
});

test('自分の投稿(記名)のみを対象にしたlistクエリは成功する', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('reports').where('submitterUid', '==', 'D12').get());
});

test('他人のsubmitterUidを条件にしたlistクエリは拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(db.collection('reports').where('submitterUid', '==', 'D12').get());
});

test('公開済み(visibility==public)のlistクエリは誰でも成功する', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  const snap = await assertSucceeds(db.collection('reports').where('visibility', '==', 'public').get());
  assert.equal(snap.size, 1);
  assert.equal(snap.docs[0].id, 'rep_public');
});

/* ===== create ===== */

function baseNewReport(overrides) {
  return Object.assign({
    category: '安全に関する報告', body: '新規報告本文', anonymous: false,
    submitterUid: 'D12', submitterName: '佐藤', submitterTeam: 'E班（佐藤班）',
    createdAt: new Date(), status: 'open',
    assigneeUid: null, assigneeName: null,
    internalNote: '', replyToReporter: '',
    visibility: 'private', statusUpdatedAt: null,
  }, overrides);
}

test('自分の正しい情報での記名投稿は成功する', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('reports').add(baseNewReport({})));
});

test('他人になりすました投稿(submitterUid偽装)は拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').add(baseNewReport({ submitterUid: 'D99', submitterName: '鈴木' })));
});

test('submitterNameが本人のusersドキュメントと不一致だと拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').add(baseNewReport({ submitterName: '偽名' })));
});

test('匿名投稿はsubmitter系が全てnullなら成功する', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('reports').add(baseNewReport({
    anonymous: true, submitterUid: null, submitterName: null, submitterTeam: null,
  })));
});

test('匿名投稿なのにsubmitterUidが残っていると拒否される(匿名性の漏洩防止)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').add(baseNewReport({
    anonymous: true, submitterUid: 'D12', submitterName: null, submitterTeam: null,
  })));
});

test('status以外の初期値(open)で投稿しようとすると拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').add(baseNewReport({ status: 'resolved' })));
});

test('assigneeUidを指定した新規投稿は拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').add(baseNewReport({ assigneeUid: 'ADM1' })));
});

test('internalNoteを指定した新規投稿は拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').add(baseNewReport({ internalNote: '不正なメモ' })));
});

test('visibilityをpublicにした新規投稿は拒否される(いきなり公開は不可)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').add(baseNewReport({ visibility: 'public' })));
});

test('未認証ユーザーは投稿できない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('reports').add(baseNewReport({})));
});

/* ===== update ===== */

test('adminは status/internalNote/assignee/reply/visibility をまとめて更新できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('reports').doc('rep_named').update({
    status: 'in_progress',
    assigneeUid: 'ADM1',
    assigneeName: '管理者一号',
    internalNote: '対応中です',
    replyToReporter: 'ご報告ありがとうございます',
    visibility: 'pending_public',
    statusUpdatedAt: new Date(),
  }));
});

test('adminは報告を削除できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'ADM1').firestore();
  await assertSucceeds(db.collection('reports').doc('rep_named').delete());
});

test('一般ユーザーは自分の報告のvisibilityをprivate→pending_publicに変更できる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('reports').doc('rep_named').update({ visibility: 'pending_public' }));
});

test('一般ユーザーは自分の報告のvisibilityをpending_public→privateに戻せる(取り下げ)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('reports').doc('rep_pending_public').update({ visibility: 'private' }));
});

test('一般ユーザーがvisibilityと同時に他フィールドを更新しようとすると拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').doc('rep_named').update({
    visibility: 'pending_public',
    status: 'resolved',
  }));
});

test('一般ユーザーはstatusを直接更新できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').doc('rep_named').update({ status: 'resolved' }));
});

test('一般ユーザーはinternalNoteを更新できない(投稿者本人でも不可)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').doc('rep_named').update({ internalNote: '覗き見' }));
});

test('一般ユーザーはassigneeUidを更新できない(自己アサインのなりすまし防止)', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').doc('rep_named').update({ assigneeUid: 'D12', assigneeName: '佐藤' }));
});

test('他人の報告のvisibilityは変更できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore();
  await assertFails(db.collection('reports').doc('rep_named').update({ visibility: 'pending_public' }));
});

test('公開済み(public)の報告は投稿者本人でもvisibilityを変更できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D99').firestore(); // rep_publicの投稿者
  await assertFails(db.collection('reports').doc('rep_public').update({ visibility: 'private' }));
});

test('匿名報告は本人であってもvisibilityを変更できない(submitterUidがnullのため)', async () => {
  await seed();
  // rep_anonは匿名のためsubmitterUid==null。実際の投稿者がD12だったとしても
  // resource.data.submitterUid(null) != myCode() が常に成立し、更新経路が無い。
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').doc('rep_anon').update({ visibility: 'pending_public' }));
});

test('一般ユーザーは報告を削除できない', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('reports').doc('rep_named').delete());
});

/* ===== counters/reports (受付番号カウンタ) ===== */

test('カウンタは署名済みユーザーならgetできる', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('counters').doc('reports').get());
});

test('未認証ユーザーはカウンタをgetできない', async () => {
  await seed();
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(db.collection('counters').doc('reports').get());
});

test('カウンタの直前値+1への更新は誰でも成功する', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('counters').doc('reports').update({ count: 6 }));
});

test('カウンタを+2以上進める更新は拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('counters').doc('reports').update({ count: 7 }));
});

test('カウンタを減らす更新は拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('counters').doc('reports').update({ count: 4 }));
});

test('カウンタ更新でcount以外のフィールドを混ぜると拒否される', async () => {
  await seed();
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('counters').doc('reports').update({ count: 6, note: 'x' }));
});

test('カウンタの新規作成はcount==1のみ成功する', async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc('D12').set({
      name: '佐藤', team: 'team_e', role: 'driver', passwordChanged: true,
    });
  });
  const db = authedContext(testEnv, 'D12').firestore();
  await assertSucceeds(db.collection('counters').doc('reports').set({ count: 1 }));
});

test('カウンタの新規作成でcount!=1は拒否される', async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection('users').doc('D12').set({
      name: '佐藤', team: 'team_e', role: 'driver', passwordChanged: true,
    });
  });
  const db = authedContext(testEnv, 'D12').firestore();
  await assertFails(db.collection('counters').doc('reports').set({ count: 2 }));
});
