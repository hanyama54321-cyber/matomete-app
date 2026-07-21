// seed-manuals.js
// 手順書(manuals)の「サンプル(実ファイルなし)」5件投入スクリプト。
// 冪等: ドキュメントIDが固定(sample_1〜sample_5)のため、何度実行しても同じ内容に上書きされるだけで壊れない。
// 実行には管理者(admin)としての認証が必須(firestore.rules: manuals作成はisAdmin()のみ許可)。
// seed.html から <script src="seed-manuals.js"></script> で読み込んで使う。
//
// fileUrl が null のドキュメントは、アプリ側で「📁 サンプル(実ファイルなし)」として表示される。
// 実マニュアル投入後は、管理画面からこれらのサンプルを個別に削除してよい。
// サンプルはあくまで見た目確認用のため、必読(mustRead)指定は行わない。

const MANUALS_SAMPLE = [
  { id: 'sample_1', title: '配送基本マニュアル',       description: '配送業務の基本手順をまとめたサンプルです。',       icon: '📦', category: '基本手順' },
  { id: 'sample_2', title: '緊急時対応フロー',         description: '事故・急病等の緊急時対応をまとめたサンプルです。', icon: '🚨', category: '安全' },
  { id: 'sample_3', title: '顧客クレーム対応ガイド',   description: 'クレーム対応の流れをまとめたサンプルです。',       icon: '📋', category: '接客' }, // カテゴリ選択肢からは削除済みだが表示互換のため保持
  { id: 'sample_4', title: '車両点検チェックリスト',   description: '出発前点検の確認項目をまとめたサンプルです。',     icon: '🚚', category: '車両管理' },
  { id: 'sample_5', title: 'アプリ操作マニュアル v3.2',description: '本アプリの操作方法をまとめたサンプルです。',       icon: '📱', category: 'システム' },
];

// db: firebase.firestore() のインスタンス。log: ログ出力用コールバック(引数1つ、文字列)
async function seedManuals(db, log) {
  log('=== manuals サンプル投入 開始(5件・冪等) ===');
  for (const m of MANUALS_SAMPLE) {
    await db.collection('manuals').doc(m.id).set({
      title: m.title,
      description: m.description,
      category: m.category,
      icon: m.icon,
      fileUrl: null,
      fileName: null,
      fileType: null,
      fileSize: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      uploaderUid: null,
      uploaderName: null,
      mustRead: false,
      readDeadline: null,
    });
    log(`✓ manuals/${m.id} → ${m.title}（サンプル・実ファイルなし）`);
  }
  log(`=== 完了(${MANUALS_SAMPLE.length}件)。再実行しても同じ内容に上書きされるだけです ===`);
}
