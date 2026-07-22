# 引き継ぎ書(2026-07-22時点)

新しいセッションで作業を再開する際は、まずこのファイルと [README.md](README.md)・[TECH_DEBT.md](TECH_DEBT.md) を読んでください。

## プロジェクト概要

- **リポジトリ**: `matomete-app`(安全配送まとめてアプリ)。単一ファイルSPA([index.html](index.html)、約7300行)+ Firebase(Firestore/Auth/Storage)。
- **ブランチ運用**: `main`=本番公開中(GitHub Pages、Firebase接続版)、`develop`=開発中。リリース時は`develop`→`main`マージ(手順は[README.md](README.md)参照)。
- **Firebaseプロジェクト**: `anzen-matomete-app`(Blazeプラン、asia-northeast1)。
- **アプリバージョン**: **v0.2.2**(本セッションでmainへ本公開済み)。

## これまでに完了した作業(直近コミット)

developブランチで、報告・手順書・KYT・ユーザーメニュー・周知の各タブをモック配列→Firestore接続へ移行済み。WAU/DAU/MAU利用状況計測(v0.2.1)・PWA standaloneボトムナビ余白修正(v0.2.2)まで**mainへ本公開済み**(GitHub Pages)。

### 本セッション: PWA standalone表示のボトムナビ下セーフエリア余白修正(v0.2.2・mainへ本公開済み)

iPhoneのホーム画面追加(standalone)表示で、`#bottom-nav`(下部タブバー)のさらに下に地の背景色(`var(--bg)`)の白い帯が見えるという実機報告への対応。

1. **原因の推定**: `#bottom-nav`の祖先(`body`/`#app`/`header`)に`transform`/`filter`/`will-change`は無く、`position:fixed`のcontaining blockが意図せずズレている可能性は低いと判断。CSSの記述自体(`position:fixed; bottom:0` + `padding-bottom: env(safe-area-inset-bottom)`)は理論上正しく、実機のみで症状が出ることから、**iOS Safari standalone表示で`backdrop-filter`併用時にセーフエリア領域の背景描画が欠落する既知の挙動**が濃厧と判断した。このサンドボックス環境では`env(safe-area-inset-*)`が常に0のため実機再現・検証はできない。
2. **修正内容**([index.html:158-186](index.html:158)): 原因の特定に依存しない防御的な対策として、`#bottom-nav::after`疑似要素を追加。`padding-bottom`が確保するセーフエリア領域(`bottom:0; height:env(safe-area-inset-bottom)`)に、ナビ本体と同色(`rgba(255,255,255,.96)`)の背景を明示的に重ね塗りする。非standalone表示では`env()=0`のため`height:0`の不可視要素となり既存表示に影響しない(ブラウザプレビューで`getComputedStyle`により`afterHeight: "0px"`を確認済み)。
3. **`#main`のpadding-bottom(76px)は変更していない**: `.nav-item`のmin-height等から実際のナビ表示高さは約55px程度で76pxはやや余裕があるが、これは報告症状(ナビの**下**の余白)とは無関係(ナビの上のスクロール領域に余分な空白ができるだけで実害なし)と判断し、見積もり誤りのリスクを避けるため触れていない。
4. **バージョン更新**: `APP_VERSION`を`0.2.1`→`0.2.2`に更新(一元化済み定数のため1箇所の変更で全表示箇所+計測`appVersion`に反映)。
5. **リリース**: develop(`4f1bbf7`)→main `--no-ff`マージ(`0f20be7`)、タグ`v0.2.2`(ロールバック用`v0.2.1-pre-navfix`も現mainの旧先端`0f82399`に作成済み)。GitHub Pagesで`Ver.0.2.2`表示・`hasFirebase:true`・コンソールエラーなしをライブ確認済み。
6. **未確認事項(次回セッションで要フォローアップ)**: **南野さんの実機(iPhone、ホーム画面追加アプリ)での白帯解消の確認がまだ**。もし残っている場合は`git reset`等ではなく`v0.2.1-pre-navfix`タグを起点に切り戻すか追加修正で再リリースする。次回セッション開始時、南野さんに確認結果を聞くこと。

### 前セッション: 利用状況計測(DAU/WAU/MAU)(v0.2.1・mainへ本公開済み)

2026-06-30に設計だけ固めていたKPI計測(層1: 利用・定着の可視化)を実装。元設計は`users`が`uid`ベースだった頃のものだったため、現行の`users/{code}`(乗務員コード5桁がドキュメントID)へ読み替えて実装した。

1. **記録**: `sessions/{auto_id}`(code/date/week/platform/appVersion/createdAt)。ログイン成功後に`recordSession()`を1回呼び、`fbUser.lastActiveDate`(既にログイン時のusersドキュメント取得で手元にある)と本日日付(JST)を比較して未記録の日のみ`sessions`追加+`users/{code}.lastActiveDate`更新を行う(1ユーザー1日1回、追加の読み取りなし)。
2. **新規実装したヘルパー**(既存になかったもの): `jstDateStr()`(Asia/Tokyoのカレンダー日を端末タイムゾーンに依存せず取得)、`dateStrToIsoWeek()`(ISO 8601週番号、木曜日基準の標準アルゴリズム。年またぎのテストケースで正しさを確認済み)、`detectPlatform()`(`matchMedia('(display-mode: standalone)')`/`navigator.standalone`+UAで`ios-pwa`/`android-pwa`/`web`を判定)。
3. **集計画面**: ユーザーメニューに「利用状況」を新設(`openUsageAnalytics()`、乗務員マスタ・班編成管理と同型のモーダル+one-shot取得パターン、`onSnapshot`は使わない)。直近90日分を`where('date','>=',...)`で絞って一括取得し、DAU/WAU/MAU(ユニーク人数のみ、個人別一覧は実装しない)と日次30日/週次12週の折れ線グラフをクライアント側集計で表示。折れ線グラフは既存のドーナツチャート(`showReach`等)と同じ「外部ライブラリなし・生SVGをtemplate literalで組み立てる」流儀で新規実装(`buildLineChartSvg()`)。
4. **バージョン文字列の一元化**: ユーザー指示により、`appVersion`計測値と表示用バージョン文字列(ヘッダーバッジ・ユーザーメニュー・アプリ情報画面)を`APP_VERSION`定数1箇所に統一。静的HTML側2箇所(`#version-badge`/`#um-version-subtitle`)は初期化処理でJSから`textContent`を上書きする形にした。次回バージョン更新時は`APP_VERSION`の値を変えるだけでよい。
5. **重要な制約(設計どおりだが要認識)**: `sessions`は`allow update, delete: if false`(**admin含め誰も削除できない、追記のみ**)。検証時に本番Firestoreへ書き込んだテスト用`sessions`ドキュメント(AAAAA/10168、2026-07-22分)は**削除できず恒久的に残る**(`users.lastActiveDate`は自己更新可能なため元に戻したが、`sessions`のレコード自体は消せない)。今後の検証でも同様にテスト分のレコードが残り続ける前提で運用すること。
6. **計測開始日について**: v0.2.1として既にmainへマージ・GitHub Pages公開済み(**実際の利用者データは公開日以降のみ蓄積される**、過去のログインは遡って計測できない)。

### 前セッション: リリース前の細部変更バッチ(v0.2)

1. **チャット: 全班チャンネルの閲覧開放**: `firestore.rules`の`channels`/`messages`のread条件を「所属班+admin」→「`isSignedIn()`全員」に緩和。write(`create`)は`channelVisible()`(所属班+admin)のまま維持(なりすまし防止含め変更なし)。クライアント側は`canWriteToCurrentChannel()`/`updateChatInputState()`を新設し、書き込み不可チャンネルでは入力欄・送信ボタンを無効化して「閲覧のみです」の通知バーを表示。自班チャンネルは`renderChannelChips()`で`.chip-own`スタイル+🏠マークにより視覚的に強調。新規`test/rules/channels.test.js`(12件)を追加。
2. **報告への返信設定をデフォルトオンに**: `openNotifSettings()`内の「報告への返信」トグルの初期値を`on:false`→`on:true`に変更。**重要な発見**: このトグルは元々`localStorage`/Firestoreどちらにも永続化されておらず、保存ボタンを押してもトースト表示のみで実際には何も保存しない完全に飾りのUIだった(既存ユーザーの移行対象データは存在しない)。
3. **LINE関連の削除**: 実装・SDK連携は元々存在せず、UI文言のみ2箇所修正——ログアウトボタンの説明文(「LINE アカウントからサインアウト」→「アカウントからサインアウトします」)、アプリ情報画面の認証方式表示(「LINE Login（LIFF）」→実態に合わせて「Firebase Authentication」)。`TECH_DEBT.md`にLINE見送りの決定記録を追加。「株式会社HI-LINE」(著作権表記の社名)は連携プラットフォームと無関係のため対象外。
4. **名称変更**: アプリ情報画面の「開発・運用」欄を「配送センター 管理部」→「名古屋共配センター」に変更。Firestore実データ(seed-announcements.jsの`authorName`等)には対象文字列が含まれておらず、データ移行は不要だった。
5. **バージョン表記をv0.2に**: `index.html`内3箇所(ヘッダーバッジ・ユーザーメニュー・アプリ情報画面)を`0.1`→`0.2`に更新。Service Worker/manifest.jsonにはバージョン・キャッシュ機構が存在しないため対応不要(この構成には無い)。
6. **PWA standalone表示のsafe-area対応(hotfix)**: ホーム画面追加時にヘッダー/ボトムナビ/トーストがステータスバー・ホームインジケーターに食い込む不具合を`env(safe-area-inset-*)`で修正。develop→mainへhotfixとして直接マージ済み(v0.1/v0.2タグはそのまま)。

### 前々セッション: 周知タブFirestore移行

1. **既存モックとの共存設計**: 既存モック6件(`MOCK_ANNOUNCEMENTS`、id=数値)を初期表示コンテンツとして温存しつつ、Firestore実データ(id=文字列)と`announcements`配列内で連結表示。`typeof a.id === 'number'`で両者を判別し、既読・編集・削除・到達率計算などあらゆる操作関数をこの型で分岐させる設計(`findAnn(id)`で文字列比較の統一検索)。モック側は編集・削除ボタンが出ない読み取り専用資産として凍結。
2. **Firestoreスキーマ**: `announcements/{id}`(title/body/category/priority/target:'all'固定/pinned/mustRead/readDeadline/tags/status/scheduledAt/authorUid/authorName/createdAt/updatedAt/publishedAt) + `announcements/{id}/reads/{code}`(既読・必読確認、`code/name/readAt/acked/ackedAt`)。manualsの`reads`サブコレクションパターンを踏襲。
3. **st.currentUid依存の解消(実データ分)**: `showAnn`/`acknowledgeAnn`が実データでは`fbUser.code`ベースで`reads`に書き込む。一覧のmust-readバッジ判定用に`fetchMyAnnAcks()`(自分のreads記録を件数分の直接doc getで一括取得、collectionGroupクエリは使わず索引不要)を追加。
4. **配信範囲・自動配信のスコープ限定**: 対象グループ(班別)選択肢は投稿エディタから削除、`target`は常に`'all'`固定。予約配信(`scheduledAt`)は「下書き+予定時刻メモ」の位置づけで**自動公開しない**、管理者の「今すぐ配信」操作のみで公開する(TECH_DEBT.md #4)。予約配信中の実データは一般ユーザーには一覧・詳細とも非表示(描画側で制御、rules上は読める)。
5. **重要な発見**: `firestore.rules`で`users`の`list`は元々admin限定のため、一般ユーザーが到達率計算用の全ドライバー一覧を取得しようとすると`permission-denied`になっていた。manuals(`fetchManualsAllDrivers`)と同じ制約であることを確認し、実データの到達率・既読/未読メンバー一覧は**管理者にのみ表示**する設計に修正。TECH_DEBT.md #1bに記録。
6. **リアクション・タグスレッド・@メンション**: スコープ外(ユーザー指示)。@メンションは実装が存在せず対応不要。リアクションはFirestoreへの書込み経路を持たず、既存のローカルmutate(`st.currentUid`のまま)がそのまま動く「凍結資産」として温存。
7. **削除方式**: manuals/kyt/reportsと同じ**物理削除**を採用(チャットのソフト削除方式は不採用)。
8. **初期データ2件投入**: `seed.html`⑨カード + 新規`seed-announcements.js`(固定id `ann_sample_1`/`ann_sample_2`、冪等)。
9. **PWA通知**: `notifyNewAnnouncement`を追加。`status:'published'`への遷移でのみ発火。

### さらに前のセッションの完了分(ユーザーメニュー改修以前)

1. **報告タブ**(`2c0a1a3`): `reports`コレクション。ステータス管理・担当者アサイン・匿名投稿・公開承認制・PWA通知。
2. **手順書タブ**(`2e087e4`): `manuals`コレクション + Cloud Storage。ファイルアップロード・必読管理・既読率。
3. **KYTタブ**(`f711d3f`): `kyt`コレクション + `completions`サブコレクション。
4. **ユーザーメニュー改修**(`1cbe436`/`8976b40`): 乗務員マスタ(新規登録・編集・削除・役割変更)・パスワード変更一本化・班編成管理・`teams`の生きたミラー化・CSV一括投入。

## 確立されたアーキテクチャパターン(次の機能もこれを踏襲すること)

- **onSnapshotミラー配列**: ログイン時(全ロール共通)に`attachXxxListener()`を開始し、`let xxx = []`をFirestoreの読み取り専用ミラーとして保持。ログアウト時に必ずunsubscribe(`showLoginScreen()`内)。
- **サブコレクション型の権限分離**: 「本人のみ書き込み可能な記録」(既読・完了記録など)は親ドキュメントとは別のサブコレクション(`{code}`をドキュメントIDに)に分離し、`code == myCode()`で本人一致を強制。
- **管理者のone-shot集計は本当に管理者限定にすること**: `fetchXxxAllDrivers()`(`users.where('role','==','driver')`)は`firestore.rules`上`list`がadmin限定のため、**一般ユーザーから呼ぶとpermission-deniedになる**。呼び出しは必ず`st.role === 'manager'`でガードする。一般ユーザー自身のデータが必要な場合は、`.doc(自分のcode).get()`のような自分専用の直接docアクセスに留める。
- **read/write権限を意図的に分離する場合**: チャットの班チャンネルのように「閲覧は全員・書き込みは所属班のみ」としたい時は、read用の判定(`isSignedIn()`のみ等)とwrite用の判定(既存の`channelVisible()`等)を別々に保つ。既存の可視性判定関数(`channelVisible()`)をread側で緩めるとwrite側にも波及してしまうため、read側は関数を経由せず直接ルールに書くか、別名の関数を新設する。
- **なりすまし防止**: create時、`request.resource.data.xxxUid == myCode()`等をルールで検証。ただしadmin限定コレクション(manuals/kyt/announcements)ではadmin間のなりすまし防止までは行わず、`allow create: if isAdmin()`のみで足りる(信頼レベルの違い)。
- **本人の単一フィールド自己更新**: `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['xxx'])`パターン。値のホワイトリスト検証(`in [...]`)も、その値を信頼する別のルール関数がある場合は必須。
- **モック資産との共存**: 一部データを実データ化する際、既存モックを「削除せず初期表示コンテンツとして残す」要件が来ることがある。id型(数値=モック/文字列=Firestore)で分岐し、モック側は読み取り専用に倒すパターン(`findAnn()`で統一検索)。
- **冪等シードスクリプト**: 固定ドキュメントIDで`.set()`、`db`・`log`引数を受け取る`seedXxx(db, log)`関数。`seed.html`にカード+ボタンを追加し、admin確認まで`disabled`。
- **CSV一括投入(差分マージ)**: ドライラン→承認→本実行の2段階。Auth作成が必要な場合はセカンダリFirebaseアプリで管理者セッションを汚染しない。
- **ルールテスト**: `test/rules/xxx.test.js`を`test/rules/manuals.test.js`と同水準で作成。`createTestEnv('xxx')`で名前空間分離。

## 未着手・既知の技術的負債

- **ゲームタブ**: 「近日公開」のプレースホルダーのみ。実装なし(本公開後も保留機能)。
- **[TECH_DEBT.md](TECH_DEBT.md)を参照**:
  1. `st.currentUid`依存: 周知タブの実データ既読は解消済み。モック6件・チャット未読カウント・`recalcTeamCounts()`の人数集計は未解消。
  1b. 周知タブの実データ到達率は`users.list`がadmin限定のため管理者にのみ表示(仕様として確定)。
  2/2b/2c. 乗務員コードCSV一括投入は対応済み。個別登録時のAuthアカウント作成・退職者削除後のAuthアカウント残留は意図的に未対応。
  3. パスワードセルフリセット機能(Cloud Functions要、設計のみ確定)。
  4. 周知タブの予約配信は自動公開されない(手動publishNowのみ、Cloud Functions導入時に対応)。
  5. 周知タブへのメール通知(将来構想、記録のみ)。
  6. LINE連携は見送り(決定記録)。将来の通知はメール基盤を優先。

## 開発環境の状態(このマシン固有)

- **Firebase CLI**: `npx firebase-tools`(ローカルインストール不要、`node_modules/firebase-tools`にdevDependency済み)。**ログイン済み**(`hanyama54321@gmail.com`)。`firebase deploy`はそのまま実行可能なはず。
- **Java**: エミュレータ用に Temurin 21 JRE を `C:\Program Files\Eclipse Adoptium\jre-21.0.11.10-hotspot` にインストール済み。**Bashツールは新規セッションでこのPATHを引き継がない**ので、テスト実行前に毎回:
  ```
  export PATH="/c/Program Files/Eclipse Adoptium/jre-21.0.11.10-hotspot/bin:$PATH"
  npm run test:rules
  ```
- **GCP IAM設定済み**: Cloud Storageのセキュリティルールが`firestore.get()`でFirestoreをクロスサービス参照するため、サービスアカウント`service-163103621501@gcp-sa-firebasestorage.iam.gserviceaccount.com`に`roles/datastore.user`を付与済み。これがないとStorageアップロードが`storage/unauthorized`で失敗する。
- **ローカル動作確認用サーバー**: 必ず`http://localhost:8000/index.html`のようにローカルサーバー経由で開くこと(`.claude/launch.json`の`matomete-app`設定、`python -m http.server 8000`)。**`file://`で直接開くと`<script src>`読み込みに失敗する**(既知の問題)。

## テスト・デプロイ手順(次回も同じ)

```bash
# 1. ルールテスト(要Java PATH設定、上記参照)
npm run test:rules

# 2. rules + indexes をデプロイ
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project anzen-matomete-app

# Storageルールを変更した場合はこちらも
npx firebase-tools deploy --only storage --project anzen-matomete-app
```

現在144件のルールテストが全pass(`test/rules/{users,reports,manuals,storage,kyt,teams,announcements,channels,sessions}.test.js`)。`firestore.rules`(sessions新設・users.lastActiveDate自己更新追加)はv0.2.1リリース時にデプロイ済み。v0.2.2(ボトムナビ余白修正)はCSS-only変更のためrules/indexesの再デプロイは不要だった。

## コミット時の運用ルール(このセッションで一貫していた点)

- `.claude/`(ローカルのdev-server起動設定`launch.json`)は毎回コミット対象外。
- `seed.html`は`.gitignore`で除外(実行後は毎回未追跡のまま)。
- コミット前に`git status`で意図しない差分がないか確認 → `npm run test:rules`全pass確認 → コミット → push、の順を徹底。
- 実機テストで本番Firestoreにテストデータを書き込んだ場合は、テスト直後に必ず削除して原状復帰する。**ただし`sessions`コレクションは`allow update, delete: if false`(追記のみ)のため、検証で作成したセッションレコード自体は削除できない**(`users.lastActiveDate`は自己更新可能なため元に戻せる)。今回のセッションでもAAAAA/10168の2026-07-22分`sessions`ドキュメントが検証用として残っている。
- **mainへのマージは指示がない限り行わない**。
- リモートに未取得のコミットがある場合は`git fetch`→`git rebase origin/develop`してからpushする(前々回セッションでREADME修正が競合しかけた実績あり)。

## 次にやるとよさそうなこと(優先度は南野さん判断)

1. **[最優先・要確認]** v0.2.2のPWA standaloneボトムナビ余白修正について、南野さんの実機(iPhone、ホーム画面追加アプリ)で白帯が解消されているか確認結果を聞く。解消されていなければ`v0.2.1-pre-navfix`タグを起点に切り戻すか追加修正を検討。
2. `st.currentUid`依存の残存箇所(モック周知データ・チャット未読・`recalcTeamCounts()`)を`fbUser.code`ベースへ統一(TECH_DEBT.md #1)。
3. developに他の未反映変更が無いか確認しつつ、次のリリースがあればREADME.mdのリリース手順に従う。
