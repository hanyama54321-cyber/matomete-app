// migrate-users-team.js
// users/{code}.team を旧値(自由文字列)から新teamId参照(team_a〜team_i / null)へ変換する。
//
// 運用: ドライラン(migrateUsersTeamDryRun)で変換計画とバックアップを確認
//       → 人間の承認 → 本実行(migrateUsersTeamApply)は承認されたplanのみを書き込む。
//
// 対応表にない値(未知の値・フィールドなし・null・空文字含む)は一切変更せず、
// skipped 一覧として返すのみ。対応表は南野さんの確定内容に基づく。

const TEAM_MAPPING = {
  'エリアB班': 'team_d',
  '本部': null,
};

// ドライラン: 書き込みは一切行わない。変換計画・スキップ一覧・変換前バックアップを返す。
async function migrateUsersTeamDryRun(db, log) {
  log('=== users.team マイグレーション: ドライラン開始(書き込みなし) ===');
  const snap = await db.collection('users').get();
  const plan = [];      // 変換対象(承認後、この配列のみを本実行に渡す)
  const skipped = [];   // 対応表にない値(スキップ)
  const backup = [];    // 変換前の全フィールドのバックアップ(JSON)

  snap.forEach(doc => {
    const d = doc.data();
    backup.push({ code: doc.id, ...d });

    // undefined(フィールドなし)は null として対応表を引く
    const oldVal = d.team === undefined ? null : d.team;
    const hasMapping = Object.prototype.hasOwnProperty.call(TEAM_MAPPING, oldVal);

    if (!hasMapping) {
      const label = oldVal === null ? '(フィールドなし/null)' : (oldVal === '' ? '(空文字)' : oldVal);
      skipped.push({ code: doc.id, name: d.name, oldTeam: label });
      log(`- スキップ(対応表になし): users/${doc.id}(${d.name})  team="${label}"`);
      return;
    }

    const newVal = TEAM_MAPPING[oldVal];
    if (newVal === oldVal) {
      log(`- 変更不要: users/${doc.id}(${d.name})  team="${oldVal}"(対応表上も同値)`);
      return;
    }

    plan.push({ code: doc.id, name: d.name, oldTeam: oldVal, newTeam: newVal });
    log(`✓ 変換予定: users/${doc.id}(${d.name})  "${oldVal}" → ${newVal === null ? 'null' : newVal}`);
  });

  log(`=== ドライラン完了: 変換対象 ${plan.length}件 / スキップ ${skipped.length}件 / 総件数 ${snap.size}件 ===`);
  return { plan, skipped, backup, total: snap.size };
}

// 本実行: 承認済みの plan(ドライランの戻り値そのもの)のみを書き込む。
// 対応表を再照会しないため、ドライラン後に対応表やデータが変わっても
// 「承認された内容以外は絶対に書き込まれない」ことを保証する。
async function migrateUsersTeamApply(db, log, plan) {
  log('=== users.team マイグレーション: 本実行開始 ===');
  for (const item of plan) {
    await db.collection('users').doc(item.code).update({ team: item.newTeam });
    log(`✓ 更新: users/${item.code}(${item.name})  team → ${item.newTeam === null ? 'null' : item.newTeam}`);
  }
  log(`=== 本実行完了(${plan.length}件更新) ===`);
}
