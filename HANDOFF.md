# 引き継ぎ書(2026-07-17時点)

新しいセッションで作業を再開する際は、まずこのファイルと [README.md](README.md)・[TECH_DEBT.md](TECH_DEBT.md) を読んでください。

## プロジェクト概要

- **リポジトリ**: `matomete-app`(安全配送まとめてアプリ)。単一ファイルSPA([index.html](index.html)、約7300行)+ Firebase(Firestore/Auth/Storage)。
- **ブランチ運用**: `main`=公開中のモック版(GitHub Pages)、`develop`=Firebase接続版(開発中)。リリース時は`develop`→`main`マージ(手順は[README.md](README.md)参照、**今回のセッションでもmainへのマージは未実施**)。
- **Firebaseプロジェクト**: `anzen-matomete-app`(Blazeプラン、asia-northeast1)。

## これまでに完了した作業(直近コミット)

developブランチで、報告・手順書・KYT・ユーザーメニュー(乗務員マスタ・パスワード・班編成)の各タブをモック配列→Firestore接続へ移行済み(前セッションまで)。今回のセッションでは、**周知(お知らせ)タブ**をFirestore接続した。

### 今回のセッション: 周知タブFirestore移行

1. **既存モックとの共存設計**: 既存モック6件(`MOCK_ANNOUNCEMENTS`、id=数値)を初期表示コンテンツとして温存しつつ、Firestore実データ(id=文字列)と`announcements`配列内で連結表示。`typeof a.id === 'number'`で両者を判別し、既読・編集・削除・到達率計算などあらゆる操作関数をこの型で分岐させる設計(`findAnn(id)`で文字列比較の統一検索)。モック側は編集・削除ボタンが出ない読み取り専用資産として凍結。
2. **Firestoreスキーマ**: `announcements/{id}`(title/body/category/priority/target:'all'固定/pinned/mustRead/readDeadline/tags/status/scheduledAt/authorUid/authorName/createdAt/updatedAt/publishedAt) + `announcements/{id}/reads/{code}`(既読・必読確認、`code/name/readAt/acked/ackedAt`)。manualsの`reads`サブコレクションパターンを踏襲。
3. **st.currentUid依存の解消(実データ分)**: `showAnn`/`acknowledgeAnn`が実データでは`fbUser.code`ベースで`reads`に書き込む。一覧のmust-readバッジ判定用に`fetchMyAnnAcks()`(自分のreads記録を件数分の直接doc getで一括取得、collectionGroupクエリは使わず索引不要)を追加。
4. **配信範囲・自動配信のスコープ限定**(ユーザー確認済み): 対象グループ(班別)選択肢は投稿エディタから削除、`target`は常に`'all'`固定。カテゴリ選択肢は分類タグとして残置。予約配信(`scheduledAt`)は「下書き+予定時刻メモ」の位置づけで**自動公開しない**、管理者の「今すぐ配信」操作のみで公開する(TECH_DEBT.md #4)。予約配信中の実データは一般ユーザーには一覧・詳細とも非表示(描画側で制御、rules上は読める)。
5. **重要な追加バグ修正(実装後の実機テストで発見)**: `firestore.rules`で`users`の`list`は元々admin限定のため、一般ユーザーが到達率計算用の全ドライバー一覧を取得しようとすると`permission-denied`になっていた。manuals(`fetchManualsAllDrivers`)と同じ制約であることを確認し、実データの到達率・既読/未読メンバー一覧は**管理者にのみ表示**する設計に修正(モック6件は従来どおり両ロールに表示、影響なし)。TECH_DEBT.md #1bに記録。
6. **リアクション・タグスレッド・@メンション**: 今回のスコープ外(ユーザー指示)。@メンションはそもそも実装が存在せず対応不要。リアクションはFirestoreへの書込み経路を持たず、既存のローカルmutate(`st.currentUid`のまま)がそのまま動く「凍結資産」として温存(モック・実データ両方で機能するが永続化はしない)。
7. **削除方式**: ユーザー確認の結果、manuals/kyt/reportsと同じ**物理削除**を採用(チャットのソフト削除方式は不採用)。
8. **初期データ2件投入**: `seed.html`⑨カード + 新規`seed-announcements.js`(固定id `ann_sample_1`/`ann_sample_2`、冪等)。「暑熱対策のお願い」「無事故キャンペーン実施のお知らせ」を投入済み・実機で表示確認済み。
9. **PWA通知**: 既存の`fbNotifOptIn`フラグ・`notifyNewReport`と同型の`notifyNewAnnouncement`を追加。`status:'published'`への遷移(新規publishedまたはscheduled→published)でのみ発火、scheduled追加時は発火しない。

### 前セッションまでの完了分

1. **報告タブ**(`2c0a1a3`): `reports`コレクション。ステータス管理・担当者アサイン・匿名投稿・公開承認制・PWA通知。
2. **手順書タブ**(`2e087e4`): `manuals`コレクション + Cloud Storage。ファイルアップロード・必読管理・既読率。
3. **KYTタブ**(`f711d3f`): `kyt`コレクション + `completions`サブコレクション。
4. **ユーザーメニュー改修**(`1cbe436`/`8976b40`): 乗務員マスタ(新規登録・編集・削除・役割変更)・パスワード変更一本化・班編成管理・`teams`の生きたミラー化・CSV一括投入。

## 確立されたアーキテクチャパターン(次の機能もこれを踏襲すること)

- **onSnapshotミラー配列**: ログイン時(全ロール共通)に`attachXxxListener()`を開始し、`let xxx = []`をFirestoreの読み取り専用ミラーとして保持。ログアウト時に必ずunsubscribe(`showLoginScreen()`内)。
- **サブコレクション型の権限分離**: 「本人のみ書き込み可能な記録」(既読・完了記録など)は親ドキュメントとは別のサブコレクション(`{code}`をドキュメントIDに)に分離し、`code == myCode()`で本人一致を強制。
- **管理者のone-shot集計は本当に管理者限定にすること**: `fetchXxxAllDrivers()`(`users.where('role','==','driver')`)は`firestore.rules`上`list`がadmin限定のため、**一般ユーザーから呼ぶとpermission-deniedになる**。呼び出しは必ず`st.role === 'manager'`でガードする(今回の周知タブ移行で一度踏み抜いた失敗、要注意)。一般ユーザー自身のデータが必要な場合は、`.doc(自分のcode).get()`のような自分専用の直接docアクセスに留める。
- **なりすまし防止**: create時、`request.resource.data.xxxUid == myCode()`等をルールで検証。ただしadmin限定コレクション(manuals/kyt/announcements)ではadmin間のなりすまし防止までは行わず、`allow create: if isAdmin()`のみで足りる(信頼レベルの違い)。
- **本人の単一フィールド自己更新**: `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['xxx'])`パターン。値のホワイトリスト検証(`in [...]`)も、その値を信頼する別のルール関数がある場合は必須。
- **モック資産との共存**: 一部データを実データ化する際、既存モックを「削除せず初期表示コンテンツとして残す」要件が来ることがある。id型(数値=モック/文字列=Firestore)で分岐し、モック側は読み取り専用に倒すのが今回確立したパターン(`findAnn()`で統一検索)。
- **冪等シードスクリプト**: 固定ドキュメントIDで`.set()`、`db`・`log`引数を受け取る`seedXxx(db, log)`関数。`seed.html`にカード+ボタンを追加し、admin確認まで`disabled`。
- **CSV一括投入(差分マージ)**: ドライラン→承認→本実行の2段階。Auth作成が必要な場合はセカンダリFirebaseアプリで管理者セッションを汚染しない。
- **ルールテスト**: `test/rules/xxx.test.js`を`test/rules/manuals.test.js`と同水準で作成。`createTestEnv('xxx')`で名前空間分離。

## 未着手・既知の技術的負債

- **ゲームタブ**: 「近日公開」のプレースホルダーのみ。実装なし。
- **[TECH_DEBT.md](TECH_DEBT.md)を参照**:
  1. `st.currentUid`依存: 周知タブの実データ既読は解消済み。モック6件・チャット未読カウント・`recalcTeamCounts()`の人数集計は未解消。
  1b. 周知タブの実データ到達率は`users.list`がadmin限定のため管理者にのみ表示(仕様として確定)。
  2/2b/2c. 乗務員コードCSV一括投入は対応済み。個別登録時のAuthアカウント作成・退職者削除後のAuthアカウント残留は意図的に未対応。
  3. パスワードセルフリセット機能(Cloud Functions要、設計のみ確定)。
  4. 周知タブの予約配信は自動公開されない(手動publishNowのみ、Cloud Functions導入時に対応)。
  5. 周知タブへのメール通知(将来構想、記録のみ)。

## 開発環境の状態(このマシン固有)

- **Firebase CLI**: `npx firebase-tools`(ローカルインストール不要、`node_modules/firebase-tools`にdevDependency済み)。**ログイン済み**(`hanyama54321@gmail.com`)。`firebase deploy`はそのまま実行可能なはず。
- **Java**: エミュレータ用に Temurin 21 JRE を `C:\Program Files\Eclipse Adoptium\jre-21.0.11.10-hotspot` にインストール済み。**Bashツールは新規セッションでこのPATHを引き継がない**ので、テスト実行前に毎回:
  ```
  export PATH="/c/Program Files/Eclipse Adoptium/jre-21.0.11.10-hotspot/bin:$PATH"
  npm run test:rules
  ```
- **GCP IAM設定済み**: Cloud Storageのセキュリティルールが`firestore.get()`でFirestoreをクロスサービス参照するため、サービスアカウント`service-163103621501@gcp-sa-firebasestorage.iam.gserviceaccount.com`に`roles/datastore.user`を付与済み。これがないとStorageアップロードが`storage/unauthorized`で失敗する。
- **ローカル動作確認用サーバー**: 必ず`http://localhost:8000/index.html`のようにローカルサーバー経由で開くこと(`.claude/launch.json`の`matomete-app`設定、`python -m http.server 8000`)。**`file://`で直接開くと`<script src>`読み込みに失敗する**(実際にこのセッションでも南野さんが遭遇、既知の問題)。

## テスト・デプロイ手順(次回も同じ)

```bash
# 1. ルールテスト(要Java PATH設定、上記参照)
npm run test:rules

# 2. rules + indexes をデプロイ
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project anzen-matomete-app

# Storageルールを変更した場合はこちらも
npx firebase-tools deploy --only storage --project anzen-matomete-app
```

現在119件のルールテストが全pass(`test/rules/{users,reports,manuals,storage,kyt,teams,announcements}.test.js`)。`firestore.rules`(announcements + reads サブコレクション追加)は今回のセッションで既にデプロイ済み。

## コミット時の運用ルール(このセッションで一貫していた点)

- `.claude/`(ローカルのdev-server起動設定`launch.json`)は毎回コミット対象外。
- `seed.html`は`.gitignore`で除外(実行後は毎回未追跡のまま)。
- コミット前に`git status`で意図しない差分がないか確認 → `npm run test:rules`全pass確認 → コミット → push、の順を徹底。
- 実機テストで本番Firestoreにテストデータを書き込んだ場合は、テスト直後に必ず削除して原状復帰する(このセッションでも実施)。
- **mainへのマージは指示がない限り行わない**。

## 次にやるとよさそうなこと(優先度は南野さん判断)

1. 周知タブに実データを投稿してみる(管理者メニューの「＋ 新しいお知らせを作成」から)。予約配信も試し、一般ユーザーには表示されないこと・「今すぐ配信」で公開されることを確認するとよい。
2. `st.currentUid`依存の残存箇所(モック周知データ・チャット未読・`recalcTeamCounts()`)を`fbUser.code`ベースへ統一(TECH_DEBT.md #1)。
3. mainへのリリース(develop動作確認が一通り終わったタイミングで、README.mdのリリース手順に従う)。
