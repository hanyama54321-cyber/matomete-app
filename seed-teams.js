// seed-teams.js
// teamsマスター(9班体制)投入スクリプト。
// 冪等: ドキュメントIDが固定(team_a〜team_i)のため、何度実行しても同じ内容に上書きされるだけで壊れない。
// 実行には管理者(admin)としての認証が必須(firestore.rules: teams書き込みはisAdmin()のみ許可)。
// seed.html から <script src="seed-teams.js"></script> で読み込んで使う。
//
// 班長交代時は下記 TEAMS_MASTER の leaderName / label だけを書き換えて再実行すればよい。
// teamId(team_a〜team_i)自体は恒久キーなので変更しないこと。

const TEAMS_MASTER = [
  { id: 'team_a', code: 'A', leaderName: '中尾',   label: '中尾班' },
  { id: 'team_b', code: 'B', leaderName: '阿部',   label: '阿部班' },
  { id: 'team_c', code: 'C', leaderName: '利部',   label: '利部班' },
  { id: 'team_d', code: 'D', leaderName: '小笠原', label: '小笠原班' },
  { id: 'team_e', code: 'E', leaderName: '佐藤',   label: '佐藤班' },
  { id: 'team_f', code: 'F', leaderName: '小林',   label: '小林班' },
  { id: 'team_g', code: 'G', leaderName: '土井',   label: '土井班' },
  { id: 'team_h', code: 'H', leaderName: '熊谷',   label: '熊谷班' },
  { id: 'team_i', code: 'I', leaderName: null,     label: '安全指導班' }, // 機能班(個人班長に紐付かない)
];

// db: firebase.firestore() のインスタンス。log: ログ出力用コールバック(引数1つ、文字列)
async function seedTeams(db, log) {
  log('=== teamsマスター投入 開始(9件・冪等) ===');
  let order = 0;
  for (const t of TEAMS_MASTER) {
    order += 1;
    const displayName = `${t.code}班（${t.label}）`;
    await db.collection('teams').doc(t.id).set({
      code: t.code,
      leaderName: t.leaderName,
      label: t.label,
      displayName,
      order,
      active: true,
    });
    log(`✓ teams/${t.id} → ${displayName}`);
  }
  log(`=== 完了(${TEAMS_MASTER.length}件)。再実行しても同じ内容に上書きされるだけです ===`);
}
