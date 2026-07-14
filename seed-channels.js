// seed-channels.js
// channels 11件(general / safety / team_a〜team_i)を投入する。
// 冪等: ドキュメントIDが固定のため再実行しても壊れない。
// 既存ドキュメントがある場合は teamId/name のみ更新し、lastMessage/createdAt は保持する
// (Phase 3でメッセージ送信時にlastMessageが実データで更新されるため、上書きしない設計)。
//
// 実行タイミング: 必ず users.team マイグレーション完了後に行うこと
// (channels可視性ルールが myUserDoc().team を参照するため)。

const CHANNELS_MASTER = [
  { id: 'general', teamId: 'all',    name: '全体連絡' },
  { id: 'safety',  teamId: 'all',    name: '安全報告' },
  { id: 'team_a',  teamId: 'team_a', name: 'A班（中尾班）' },
  { id: 'team_b',  teamId: 'team_b', name: 'B班（阿部班）' },
  { id: 'team_c',  teamId: 'team_c', name: 'C班（利部班）' },
  { id: 'team_d',  teamId: 'team_d', name: 'D班（小笠原班）' },
  { id: 'team_e',  teamId: 'team_e', name: 'E班（佐藤班）' },
  { id: 'team_f',  teamId: 'team_f', name: 'F班（小林班）' },
  { id: 'team_g',  teamId: 'team_g', name: 'G班（土井班）' },
  { id: 'team_h',  teamId: 'team_h', name: 'H班（熊谷班）' },
  { id: 'team_i',  teamId: 'team_i', name: 'I班（安全指導班）' },
];

async function seedChannels(db, log) {
  log('=== channels 11件 投入 開始 ===');
  for (const c of CHANNELS_MASTER) {
    const ref = db.collection('channels').doc(c.id);
    const existing = await ref.get();
    if (existing.exists) {
      await ref.set({ teamId: c.teamId, name: c.name }, { merge: true });
      log(`✓ channels/${c.id} 更新(既存のlastMessage/createdAtは保持) teamId=${c.teamId}`);
    } else {
      await ref.set({
        teamId: c.teamId,
        name: c.name,
        lastMessage: null,
        createdAt: new Date().toISOString(),
      });
      log(`✓ channels/${c.id} 新規作成 teamId=${c.teamId}`);
    }
  }
  log(`=== 完了(${CHANNELS_MASTER.length}件) ===`);
}
