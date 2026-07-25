# 引き継ぎ書(2026-07-25時点)

新しいセッションで作業を再開する際は、まずこのファイルと [README.md](README.md)・[TECH_DEBT.md](TECH_DEBT.md) を読んでください。

## プロジェクト概要

- **リポジトリ**: `matomete-app`(安全配送まとめてアプリ)。単一ファイルSPA([index.html](index.html)、約7500行)+ Firebase(Firestore/Auth/Storage/**Cloud Functions/FCM**)。
- **ブランチ運用**: `main`=本番公開中(GitHub Pages、Firebase接続版)、`develop`=開発中。リリース時は`develop`→`main`マージ(手順は[README.md](README.md)参照)。
- **Firebaseプロジェクト**: `anzen-matomete-app`(Blazeプラン、asia-northeast1)。
- **アプリバージョン**: **v0.3(mainへ本公開済み、GitHub Pages反映確認済み)**。マージコミット`dda1ef9`、タグ`v0.3`(ロールバック用`v0.2.3-pre-fcm`は旧mainの`7262635`に作成済み)。

## 前セッション: FCMプッシュ通知の実装・本番マージ(v0.3・mainへ本公開済み)

「FCMプッシュ通知 実装設計書 v2」(2026-07-24)に基づき実装。このアプリで**初めてCloud Functionsを導入**した。実装計画は3ラウンドの南野さんレビューを経て承認され、その内容に沿って実装している(計画の詳細な経緯はセッション内のやりとり参照、要点のみ以下に記録)。

### Cloud Functions基盤(`functions/`新設)

- Node 20、`firebase-functions` v2 API、リージョン`asia-northeast1`、全関数`maxInstances`設定済み
- `functions/lib/`: `admin.js`(modular API、`initializeApp`/`getFirestore`/`getMessaging`)・`auth.js`(`codeFromAuth`/`requireAdmin`)・`constants.js`・`hash.js`・`tokens.js`・`send.js`・`idempotency.js`
- トリガー5つ: `onAnnouncementNotify`(`onDocumentWritten`、create/update両対応。削除イベントガード+自己再帰ガード(notifiedAtのみの差分は無視)必須)・`onReportCreated`・`onReportReplyNotify`(`reports`本体を書かず`private/replyNotify`にのみ書き込むことで自己再帰を回避)・`onManualCreated`・`cleanupStaleTokens`(週次、`collectionGroup('tokens')`の180日超`lastSeenAt`を削除)
- callable3つ: `sendUnreadReminder`・`subscribeToReport`(匿名報告のFCMトピック購読。トピック名はFunctions側でランダム生成しクライアントに返さない、`private/notify`に保存、購読受付は報告作成後60秒以内・一度きり)・`estimateNotifyAudience`(送信前確認ダイアログの概算人数算出。`sendUnreadReminder`と同じ管理者限定チェックを実施)
- **本番デプロイ済み**(`firebase deploy --only functions`)。初回デプロイ時、以下を実施:
  - `firebase functions:artifacts:setpolicy --location asia-northeast1 --force`(Artifact Registryのイメージ蓄積による無料枠超過防止。既に1日ポリシーが自動設定されていることを確認)
  - `cleanupStaleTokens`の`schedule: 'every 7 days'`はCloud Scheduler側で400エラー(スケジュール文字列を認識せず)になったため、標準unix-cron形式`'0 3 * * 0'`(毎週日曜3:00 JST)に変更して解決

### Firestoreスキーマ・ルール追加

`firestore.rules`に追加(**本番デプロイ済み**): `users/{code}.notifyPrefs`(本人単独更新可、キー許可リスト+bool型を`validNotifyPrefs()`で検証)・`users/{code}/tokens/{tokenId}`(本人のみ読み書き)・`config/{docId}`(read全員/write admin。`config/notifications`を`{openToAllUsers:false}`で本番作成済み)・`reports/{id}/private/{docId}`(全クライアントread/write不可、Admin SDK専用)。`firestore.indexes.json`に`tokens`コレクショングループの`lastSeenAt`インデックス追加。ルールテスト25件追加(`tokens.test.js`/`config.test.js`新規、`users.test.js`/`reports.test.js`拡張)、**169件全pass**。

### クライアント実装(`index.html`)

- `firebase-messaging-compat.js`/`firebase-functions-compat.js`追加、`fbFunctions = firebase.app().functions('asia-northeast1')`
- `FCM_VAPID_KEY`定数(南野さんがFirebase Consoleで生成した公開鍵を設定済み。`index.html`1箇所のみに定義し、全`getToken()`呼び出しがこれを参照。公開鍵のためリポジトリに含めてよい)
- トークンライフサイクル: `registerFcmTokenIfPossible()`/`refreshFcmTokenIfNeeded()`(ログイン時)/`deleteFcmTokenForThisDevice()`(ログアウト時、`signOut()`から`fbAuth.signOut()`より先にawait)。`tokenId`はトークン文字列のSHA-256ハッシュ(`sha256Hex()`、`crypto.subtle`)
- `openNotifSettings()`を全面再設計: `Notification.permission`の`default`/`granted`/`denied`3分岐、5イベント(必読お知らせ/未読リマインダー/手順書追加/報告への回答/新規報告(admin限定))のトグル。`denied`時は端末別復帰手順を案内
- `canShowNotifyOptIn()`によるStage0ゲート(`role==='admin'`または`config/notifications.openToAllUsers`)。`registerFcmTokenIfPossible`等もこのゲート配下
- `openNotifySendConfirm()`共通確認モーダル(概算人数・ロック画面文言プレビュー・現在時刻・取消不可の明記)を`saveAnn()`即時公開パス・`publishNow()`(mustRead時のみ)・manuals新規追加・`sendReminder()`/`remindManRead()`(未読リマインダー)の4箇所に組み込み
- `saveReply()`に「通知して保存」チェックボックス追加(初回デフォルトON・2回目以降OFF)。`replyNotifyIntentAt`をreports本体に書き込み、Functions側が検知して送信
- `submitFb()`に静的注記追加+匿名投稿時`subscribeAnonReportIfPossible()`をfire-and-forget呼び出し
- **旧フォアグラウンド通知機構は完全撤去**: `notifyNewReport`/`notifyNewAnnouncement`/`enableReportNotifications`/`updateReportNotifUI`、`localStorage['fbNotifOptIn']`、報告タブの「新着報告の通知」カードHTML、および関連する`reportsAdminInitialLoadDone`/`announcementsInitialLoadDone`(存在意義が旧機構の誤発火防止のみだったため合わせて削除)
- **ユーザーメニュー「通知設定」項目自体もStage0ゲート済み**(`#um-notif-btn`): 当初`openNotifSettings()`の中身だけをゲートしており、メニュー項目(導線)自体は全ロールに常時表示されていた不備をマージ前に発見・修正。乗務員マスタ等と同じ「デフォルトhidden+`updateNotifMenuVisibility()`で解除」パターンに統一し、`setRole()`と`config/notifications`ミラー到着時の両方で再評価する。本番URLでdriverロールをシミュレートして非表示を確認済み

### Service Worker(`firebase-messaging-sw.js`新規)

通知受信専用の最小構成(`fetch`ハンドラなし)。`SW_VERSION`は`APP_VERSION`と別系統(現在`'sw-1'`、SW内容を実際に変更した回だけ上げる)。`firebaseConfig`はindex.htmlと同期させる旨のコメント付きで転記。ロック画面文言はSW側の`buildNotificationContent()`で組み立て(data-only送信、報告関連2件は内容を一切含めない)。

### 未知のCloud Function `sendAnnouncementEmail` の退避・削除

初回`firebase deploy --only functions`実行時、このリポジトリのgit履歴に存在しない関数`sendAnnouncementEmail`(`announcements/{docId}`のonCreateトリガー、メール送信試作)が本番デプロイ済みであることが判明。南野さん確認の結果、Cloud Functions基盤新設以前にFirebase Consoleから直接デプロイした試作とのこと。gcloud CLI未インストールのため、`firebase-tools`のログイン済み認証情報でCloud Functions v2 REST API/Cloud Storage JSON APIを直接叩いて構成・ソースを取得(`gcloud describe`/`delete`の代替)。ソース中に直書きされていたGmailアプリパスワードは`<REDACTED>`に置換して`docs/archive/sendAnnouncementEmail/`に退避、本体は削除済み(南野さんによりアプリパスワードも失効済み)。詳細は[docs/メール通知_将来実装メモ.md](docs/メール通知_将来実装メモ.md)、技術的な記録は[TECH_DEBT.md](TECH_DEBT.md)項目5参照。この一件により`firebase deploy --only functions`の個別関数名指定運用は不要になった(フルシンクで正常に通ることを確認済み)。

### 段階的展開(Stage0〜2)の現状

**mainマージ・本番公開済み、Stage1も完了。現在Stage2への移行が南野さんの判断待ち。** develop→main `--no-ff`マージ(`dda1ef9`)、タグ`v0.3`。GitHub Pagesで`Ver.0.3`表示・コンソールエラーなしをライブ確認済み。マージ後、以下を本番URLで確認済み:
- `config/notifications.openToAllUsers`が`false`のままであること(REST APIで直接確認)
- driverロールをシミュレートし、ユーザーメニューに「通知設定」項目が表示されないこと(`#um-notif-btn`が`hidden`)
- 周知・手順書・報告・チャット・KYTタブの表示に回帰がないこと

VAPID鍵は南野さんが生成した公開鍵を`FCM_VAPID_KEY`に設定済み。

**Stage1完了(2026-07-25、南野さんの実機で実施)**: iOS standalone / Androidの実機で5イベントすべての受信、ロック画面の文言、タップ後の遷移、ログアウト時のトークン削除を確認済み。**この検証はメニュー項目のStage0ゲート修正(`96db84f`)より前の版で実施されている**が、その修正は通知の配信経路(Cloud Functions側の送信ロジック)には影響しないため南野さんの判断により再検証は不要としている。

**次のアクション: Stage2(南野さんの判断待ち)**。`config/notifications.openToAllUsers`を`true`に更新するだけでよい(コード変更・再マージ不要)。Stage2でフラグをtrueにした際は、乗務員のメニューに「通知設定」が表示されることを実機で確認する(`96db84f`の修正箇所の初めての実機確認になる)。Stage0〜2の間、旧機構撤去により一般ドライバーは通知機能を持たない空白期間になっている(許容済み、詳細はTECH_DEBT.md項目8。長く保留しないこと)。

### 未検証・既知のリスク

- **実機でのプッシュ受信確認は未実施**(iOS standalone / Android とも)。このサンドボックスでは`env(safe-area-inset-*)`同様に検証不可能
- ローカルFirestore/Functionsエミュレータで、削除イベントガード・自己再帰ガード・callable認証拒否(未認証/非admin)は確認済み。ただし**FCM実送信自体はエミュレータで再現できない**(`subscribeToTopic`が実際のGoogleサーバーへの認証を要求し、ローカル環境では`messaging/authentication-error`になることを確認)
- `firebase-functions-compat.js`は同一ページに`firebase-messaging`があるとcallable呼び出しのたびに内部でFCMトークン取得を試み、`Notification.permission==='granted'`だがService Worker未登録だとcallable呼び出し自体が失敗する挙動をローカル検証で確認(詳細はTECH_DEBT.md項目8)

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
  2/2b/2c. 乗務員コードCSV一括投入は対応済み。個別登録時のAuthアカウント作成・退職者削除後のAuthアカウント残留は意図的に未対応(`functions/`基盤は新設済みのため対応可能に)。
  3. パスワードセルフリセット機能(`functions/`基盤は新設済み、設計のみ確定)。
  4. 周知タブの予約配信は自動公開されない(手動publishNowのみ。ただし後追い公開時のプッシュ通知自体はv0.3で対応済み)。
  5. 周知タブへのメール通知(将来構想。詳細は[docs/メール通知_将来実装メモ.md](docs/メール通知_将来実装メモ.md))。
  6. LINE連携は見送り(決定記録)。
  7. チャットの読み取りコスト設計(初回件数是正のみ対応済み、`persistentLocalCache`・90日超アーカイブは未対応)。
  8. **FCMプッシュ通知(v0.3)**: mainマージ済み・Stage1完了(2026-07-25、実機検証済み)。Stage2(`config/notifications.openToAllUsers`をtrueに)は南野さんの判断待ち。ユーザーコード変換規則(`myCode()`相当)がrulesとfunctionsの2箇所にある点、Stage0〜2の通知空白期間の申し送りを含む。

## 開発環境の状態(このマシン固有)

- **Firebase CLI**: `npx firebase-tools`(ローカルインストール不要、`node_modules/firebase-tools`にdevDependency済み)。**ログイン済み**(`hanyama54321@gmail.com`)。`firebase deploy`はそのまま実行可能なはず。
- **gcloud CLIは未インストール**(本セッションで判明)。Cloud Functionsの`describe`/`delete`等gcloud相当の操作が必要な場合は、`firebase-tools/lib/auth.js`の`getGlobalDefaultAccount()`+`getAccessToken()`でアクセストークンを取得し、Cloud Functions v2 / Cloud Storage / Firestore の各REST APIを直接叩くことで代替できる(本セッションで`sendAnnouncementEmail`の調査・削除、`config/notifications`の作成に使用した実績あり。再利用可能な手法)。
- **Java**: エミュレータ用に Temurin 21 JRE を `C:\Program Files\Eclipse Adoptium\jre-21.0.11.10-hotspot` にインストール済み。**Bashツールは新規セッションでこのPATHを引き継がない**ので、テスト実行前に毎回:
  ```
  export PATH="/c/Program Files/Eclipse Adoptium/jre-21.0.11.10-hotspot/bin:$PATH"
  npm run test:rules
  ```
- **GCP IAM設定済み**: Cloud Storageのセキュリティルールが`firestore.get()`でFirestoreをクロスサービス参照するため、サービスアカウント`service-163103621501@gcp-sa-firebasestorage.iam.gserviceaccount.com`に`roles/datastore.user`を付与済み。これがないとStorageアップロードが`storage/unauthorized`で失敗する。
- **ローカル動作確認用サーバー**: 必ず`http://localhost:8000/index.html`のようにローカルサーバー経由で開くこと(`.claude/launch.json`の`matomete-app`設定、`python -m http.server 8000`)。**`file://`で直接開くと`<script src>`読み込みに失敗する**(既知の問題)。
- **VAPID鍵は未設定**: `index.html`の`FCM_VAPID_KEY`定数が空文字のまま。Firebase Console → プロジェクト設定 → Cloud Messaging → ウェブ構成 → 鍵ペアの生成、で取得した公開鍵を設定するまでFCMトークン登録は動作しない(南野さんの作業待ち)。

## テスト・デプロイ手順(次回も同じ)

```bash
# 1. ルールテスト(要Java PATH設定、上記参照)
npm run test:rules

# 2. rules + indexes をデプロイ
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project anzen-matomete-app

# 3. Cloud Functionsをデプロイ(sendAnnouncementEmail削除済みのため個別指定不要)
npx firebase-tools deploy --only functions --project anzen-matomete-app

# Storageルールを変更した場合はこちらも
npx firebase-tools deploy --only storage --project anzen-matomete-app
```

現在169件のルールテストが全pass(`test/rules/{users,reports,manuals,storage,kyt,teams,announcements,channels,sessions,tokens,config}.test.js`)。`firestore.rules`/`firestore.indexes.json`・Cloud Functions(8関数)・`index.html`(FCMクライアント実装)ともv0.3としてmainへマージ・本番デプロイ済み。

## コミット時の運用ルール(このセッションで一貫していた点)

- `.claude/`(ローカルのdev-server起動設定`launch.json`)は毎回コミット対象外。
- `seed.html`は`.gitignore`で除外(実行後は毎回未追跡のまま)。
- コミット前に`git status`で意図しない差分がないか確認 → `npm run test:rules`全pass確認 → コミット → push、の順を徹底。
- 実機テストで本番Firestoreにテストデータを書き込んだ場合は、テスト直後に必ず削除して原状復帰する。**ただし`sessions`コレクションは`allow update, delete: if false`(追記のみ)のため、検証で作成したセッションレコード自体は削除できない**(`users.lastActiveDate`は自己更新可能なため元に戻せる)。
- **mainへのマージは指示がない限り行わない**。
- リモートに未取得のコミットがある場合は`git fetch`→`git rebase origin/develop`してからpushする。
- **作業開始時は必ず`git branch`で`develop`にいることを確認する**。本セッション開始時、前回セッションのv0.2.3マージ後の`git checkout main`から戻し忘れており、`main`ブランチのまま実装を始めてしまっていたことに気づいて`git checkout develop`で移し替えた実績がある(まだ何もコミットしていなかったため実害なし)。

## 次にやるとよさそうなこと(優先度は南野さん判断)

1. **[最優先]** v0.3はmainへマージ・本番公開済み、VAPID鍵も設定済み、**Stage1(南野さんの実機での通知許可→5イベント発火→受信確認)も2026-07-25に完了済み**(iOS standalone / Android、ロック画面文言・タップ後の遷移・ログアウト時のトークン削除まで確認済み)。**残るはStage2(`config/notifications.openToAllUsers`をtrueに更新)の南野さんの判断待ち。** コード変更・再マージ不要。長く保留しないこと。Stage2で`true`にした際は、乗務員のメニューに「通知設定」が表示されることを実機で確認する(メニュー項目のゲート修正`96db84f`はStage1検証より後に入ったため、この点は未確認)。万一問題が見つかった場合は`v0.2.3-pre-fcm`タグへのロールバックを検討。
3. `st.currentUid`依存の残存箇所(モック周知データ・チャット未読・`recalcTeamCounts()`)を`fbUser.code`ベースへ統一(TECH_DEBT.md #1)。
4. developに他の未反映変更が無いか確認しつつ、次のリリースがあればREADME.mdのリリース手順に従う。
