// seed-announcements.js
// 周知(お知らせ)初期データ2件投入スクリプト。
// 冪等: ドキュメントIDが固定(ann_sample_1/ann_sample_2)のため、何度実行しても同じ内容に上書きされるだけで壊れない。
// 実行には管理者(admin)としての認証が必須(firestore.rules: announcements書き込みはisAdmin()のみ許可)。
// seed.html から <script src="seed-announcements.js"></script> で読み込んで使う。

const ANNOUNCEMENTS_SAMPLE = [
  {
    id: 'ann_sample_1',
    title: '暑熱対策のお願い',
    body: '連日厳しい暑さが続いています。配送業務中の熱中症を防ぐため、以下を心がけてください。\n・出発前、休憩時のこまめな水分・塩分補給\n・車内温度の調整と直射日光対策\n・めまい、頭痛など体調異変を感じたら無理をせず、すぐに事務所へ連絡\n\n体調管理も安全配送の一部です。お互いに声をかけ合い、この夏を乗り切りましょう。',
    category: 'safety',
    priority: 'high',
    mustRead: false,
  },
  {
    id: 'ann_sample_2',
    title: '無事故キャンペーン実施のお知らせ',
    body: '7月18日（土）〜10月25日（日）の期間、無事故キャンペーンを実施します。\n\n一件一件の丁寧な運転の積み重ねが、無事故の記録につながります。基本動作（指差呼称・バック時の後方確認・交差点での徐行）を再確認し、全員で無事故を達成しましょう。\n\n詳細は各班長またはチャットでの案内をご確認ください。',
    category: 'work',
    priority: 'normal',
    mustRead: false,
  },
];

// db: firebase.firestore() のインスタンス。log: ログ出力用コールバック(引数1つ、文字列)
async function seedAnnouncements(db, log) {
  log('=== 周知 初期データ投入 開始(2件・冪等) ===');
  for (const a of ANNOUNCEMENTS_SAMPLE) {
    await db.collection('announcements').doc(a.id).set({
      title: a.title,
      body: a.body,
      category: a.category,
      priority: a.priority,
      target: 'all',
      pinned: false,
      mustRead: a.mustRead,
      readDeadline: null,
      tags: [],
      status: 'published',
      scheduledAt: null,
      authorUid: null,
      authorName: '安全管理部',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      publishedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    log(`✓ announcements/${a.id} → ${a.title}`);
  }
  log('=== 完了(2件)。再実行しても同じ内容に上書きされるだけです ===');
}
