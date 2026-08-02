# 引き継ぎ書(2026-08-03時点)

新しいセッションで作業を再開する際は、まずこのファイルと [README.md](README.md)・[TECH_DEBT.md](TECH_DEBT.md) を読んでください。

## プロジェクト概要

- **リポジトリ**: `matomete-app`(安全配送まとめてアプリ)。単一ファイルSPA([index.html](index.html)、約8600行)+ Firebase(Firestore/Auth/Storage/**Cloud Functions/FCM**)。
- **ブランチ運用**: `main`=本番公開中(GitHub Pages、Firebase接続版)、`develop`=開発中。リリース時は`develop`→`main`マージ(手順は[README.md](README.md)参照)。
- **Firebaseプロジェクト**: `anzen-matomete-app`(Blazeプラン、asia-northeast1)。
- **アプリバージョン**: **v0.4.1(developのみ。mainマージ・タグ付けは南野さんが実施)**。
  本番公開中は引き続き**v0.4**(マージコミット`cf15ad2`、タグ`v0.4`)。
  **v0.4.1の切り戻し先はv0.4**。ロールバック用タグ`v0.4-pre-badge-fix`を現main先端に作成すること。
- **v0.4の実機確認は完了済み**(ベル・タブの新着マーク・通知センター・PWA下部の白帯、いずれも問題なし)。

## 次のセッションで最初に確認すること

**v0.4.1の実機確認がまだです。** 実装とブラウザ実測までは完了していますが、
iOS実機での確認は依頼者(南野さん)が実施する取り決めです。セッション開始時に結果を聞いてください。

1. 手順書のタイトル・説明を編集 → 保存され、一覧に反映される
2. 手順書の新規追加・必読設定が引き続き動作する(デグレ確認)
3. ベル・タブの赤点、周知タブ各行の未読ドットの見え方
4. 周知タブで未読(青)と必読ピル(赤)が引き続き区別できる
5. pulseが2回で止まり、その後静止している

**あわせて`--badge-dot-bell`の最終値(10px / 12px)を確定すること。** 現在は10pxを暫定値として
実装済みで、変更する場合は[index.html](index.html)の`:root`にある同定数1箇所を書き換えるだけで済みます。

問題があれば`v0.4`タグ(または`v0.4-pre-badge-fix`)へ切り戻せます。

### 実機確認が終わったら、間を空けずにv0.4.2へ着手すること

インライン`onclick`に自由入力テキストを埋めている**予備軍3系統4箇所**が未修正です
(周知タグ・KYT選択肢・班チャンネル名)。調査は完了しており、
**[TECH_DEBT.md](TECH_DEBT.md)項目12に全量を記録済みなので再調査は不要**です。

**KYT選択肢に`"`が入るとそのシナリオが回答不能になる**ため、恒久的な負債にはしません。

> **⚠️ v0.4.2をリリースするまでの暫定の運用回避策**
> **周知タグ・KYT選択肢・班チャンネル名に、ダブルクォート`"`とシングルクォート`'`を使わないこと。**
> 入力できるのは管理者のみのため運用で回避できます。

## 本セッション: v0.4.1 手順書編集の保存不具合修正・新着ドットの視認性強化(develop)

| commit | 内容 |
|---|---|
| `0beac45` | 手順書の編集が無言で保存できない不具合を修正(主バグの根治) |
| `0dfa295` | 新着ドットの視認性強化(CSS変数へ集約・box-shadowリング化) |

### 改修2: 手順書のタイトル・説明が保存できない(原因確定・修正済み)

当初は「Firestore rulesの`update`未開放」が最有力と想定されていましたが、**3つの前提がいずれも
誤りであることが実コード調査で判明**しました。切り分けの結論は以下のとおりです。

- **rulesは原因ではない**。[firestore.rules:245](firestore.rules:245)は元から
  `allow create, delete, update: if isAdmin();`で開放済み。ルールテストにも
  「adminはmanualsを更新できる」が[test/rules/manuals.test.js:106](test/rules/manuals.test.js:106)に既存
- **真の原因は`onclick`属性のクォート破壊**。`onclick="saveManEditor(${JSON.stringify(id)})"`が
  生のダブルクォート付き`"abc123"`を出力して属性値を終端させ、ハンドラがコンパイルされず
  `btn.onclick === null`になっていた。新規追加時は`id === null`で壊れないため編集時だけ発生
- インライン`onclick`を廃止し`addEventListener`で結線する方式へ変更(クォート回避は
  idに引用符が混ざれば再発する対症療法のため採らない)

実ブラウザで、通常のFirestore ID・引用符入りID(`we"ird'id`)・新規追加(`null`)の3パターンとも
`saveManEditor`が正しい引数で呼ばれることを確認済み。

**`publishedAt`の新設は見送りました。** 「編集すると新着が再点灯する」という前提が誤りで、
`unreadManuals()`は`createdAt`のみ参照、Cloud Functionも`onDocumentCreated`のため、
編集しても新着は再点灯しません。判断根拠は[TECH_DEBT.md](TECH_DEBT.md)項目13に記録。

### 改修1: 新着ドットの視認性強化

**点が小さく見えていた原因は、サイズ指定ではなく`box-sizing: border-box`でした。**
[index.html:81](index.html:81)のグローバル指定により`border`が指定幅の内側に食い込み、
赤い芯は`.bell-dot`で実測5.3px(指定8px)、`.nav-badge`で約6px(指定9px)まで縮んでいました。

- `:root`に`--badge-dot` / `--badge-dot-bell` / `--badge-ring` / `--badge-color` /
  `--badge-color-unread`を新設し、個別クラスへの数値直書きをやめた
- リングを`border`から`box-shadow`へ変更。外側に描画されるため`box-sizing`の影響を受けず、
  指定値がそのまま芯の直径になり、レイアウトにも影響しない
- 芯は3箇所とも10px + リング2px(実効14px)。位置指定は実機確認済みの値のまま変更していない
- 周知タブの未読ドットは[index.html:4448](index.html:4448)のインラインstyleから
  `.ann-unread-dot`へ切り出し。**色は青(`--primary`)のまま維持**。赤は同じカード内の
  `.must-read-badge`(必読)が使っており、未読まで赤にすると赤が2つの意味を持つため
- 出現時に2回だけ脈動する`badge-dot-pulse`を`.bell-dot`と`.nav-badge`に付与(無限ループにしない)。
  **`.ann-unread-dot`には付けない**——未読が並ぶ一覧では再描画のたびに全行が一斉に脈動するため
- `prefers-reduced-motion: reduce`で`.bell-dot` / `.nav-badge`のアニメーションを無効化

ブラウザ実測: 芯10px・リング2px・`.ann-unread-dot`の背景が`rgb(26,86,196)`(青)、
`animation-iteration-count: 2`、`.ann-unread-dot`は`animation-name: none`、
バッジ有無で`.nav-icon`の寸法が27.47×20で不変(レイアウトずれなし)、ボトムナビ高さ55px据え置き。

### 作業不要と判明した2件(指示に含まれていたが既に対応済みだった)

- **「メール」表記の削除**: 既にv0.3.1(`8fbb403`)で実施済み。現在`index.html`内の「メール」は
  [index.html:8882](index.html:8882)のコード内コメント1件のみ(Firebase Authの仕様説明)
- **「この通知への反応」の削除**: 既にv0.3.1(`c9a0eec`)で実施済み。`reactions`の出現数0件

### リリース後の作業: マニュアル3点の追随

早見表の端末図解(①ベルの赤点 ②タブの赤点 ③必読の目印)とドライバー用ガイドの画面レプリカは
**別ファイルのCSSで組んでいるため自動追随しません**。v0.4.1でドットのサイズが変わるため、
実物と見た目がずれます。ただし**今回はサイズ拡大のみで意味は変わらない**ため緊急性は低いです。

### 別件で見つけた既存の不具合(v0.4.1では未修正)

[index.html:1039](index.html:1039)付近に**セレクタを失ったCSS宣言ブロック**があり、
パーサのエラー回復が後続の`.role-menu`ルールごと飲み込んでいます(CSSOM上に`.role-menu`が
存在しないことを実測で確認)。初回コミット`cc3b749`から存在する既存バグです。
`.role-menu`は無効化済みの開発用ロール切替メニューのスタイルなので実害は軽微ですが、
スコープ外のため今回は手を付けていません。

## 前セッション: v0.4 通知センター＋各タブの新着マーク(mainへ本公開済み)

設計指示書に基づき5段階に分けて実装しました(段階ごとに commit を分けています)。

| 段階 | commit | 内容 |
|---|---|---|
| 1 | `fec4e54` | バッジ集約ドキュメント(`users/{code}/state/badges`)と移行処理 |
| 2 | `4ddfdf4` | 各タブの未読判定とタブの新着マーク、`users.createdAt`追加 |
| 3 | `7c26a3d` | ベルの復活と通知センター |
| 4 | `bfaafa0` | 報告の双方向既読と管理者UI |
| 5 | `20d73eb` | 横断確認・バージョン更新・ドキュメント整備 |
| リリース | `48a4637` → `cf15ad2` | BADGE_EPOCH更新 → mainへ`--no-ff`マージ、タグ`v0.4` |

**`BADGE_EPOCH`は`2026-07-30T03:30:00+09:00`(リリース時刻)に更新済み**です。この定数は
`state/badges`が未作成のユーザーを初期化するときの足切り値としてのみ使われるため、
既にログイン済みのユーザーには以後影響しません。

**ルールテストは189件全pass**、`firestore.rules`は本番デプロイ済みです。

### 中核となる設計原則(改修時に必ず守ること)

**タブごとに、通知センターとタブの新着マークが同じ判定関数を見る。** 通知センターの一覧は
`unreadAnnouncements()` / `unreadManuals()` / `unreadKytScenarios()` / `unreadReportsForAdmin()` /
`unreadReplyReports()` を再利用して組み立てており、**通知センター専用の既読フラグやクエリは
作っていません**。別系統で組むと表示が必ずズレます。

**通知センターは既読を一切書き込みません。** 行タップは遷移のみで、既読化は遷移先の既存処理
(周知・手順書=詳細を開いた時の自動登録、KYT・報告=`switchTab()`の`markBadgeSeen()`、
報告の回答=詳細表示時の`markReportReplyRead()`)に委ねています。

### タブごとの判定方式

| タブ | 方式 | 消えるきっかけ |
|---|---|---|
| 周知 | 項目単位(既存`reads`) | 詳細を開く |
| 手順書 | 項目単位(既存`reads`) | 詳細を開く |
| 報告(乗務員) | 項目単位(`replyUpdatedAt > replyReadAt`) | 回答を開く |
| 報告(管理者) | 時刻方式(`reportsSeenAt`) | 報告タブを開く |
| KYT | 時刻方式(`kytSeenAt`) | KYTタブを開く |
| チャット | 時刻方式(チャンネル単位) | チャンネルを開く/自分が送信する |
| ゲーム | 対象外 | — |

**ベルの点灯 = 通知センターに出る項目が1件以上。チャットは通知センターに載せないため、
チャットに新着があってもベルは点灯しません**(チャットタブのドットのみ点灯)。取り違えやすい点です。

### 実装上の要点

- `attachMyReplyReportsListener()`は既存の`attachMyReportsListener()`とは別物です。後者は報告ビュー
  表示中のみ張られ、かつグローバルの`reports`を上書きするため、タブを開く前の判定には使えません。
- 集約ドキュメントへの書き込みは5秒に1回へデバウンスし、タブ離脱(`visibilitychange`/`pagehide`)で
  即時フラッシュします。ログアウト時は`fbUser`をnullにする前にフラッシュします。
- 時刻は必ず`serverTimestamp()`。ローカル先行値(端末時計)はUIを即座に既読化するためだけに使い、
  **サーバー確定値が届いた時点で破棄**します。これが無いと端末時計のズレがドットの点灯・消灯に
  影響します(段階3で修正済み)。

### マニュアルへの影響(改定要否のご判断材料)

v0.3.1でヘッダーのベルと周知タブの新着マークを「機能していない飾り」として撤去しましたが、
**v0.4で両方とも実データに基づいて動く機能として復活しました**。そのため、マニュアル3点に
写り込んでいる画像(ベルあり・周知タブにバッジあり)は、再び実物と一致する見込みです。
ただし以下は当時と異なります:

- ベルの赤い点は**件数を表示しません**(点のみ)。旧画像に件数バッジが写っている場合は不一致です
- 周知タブの新着マークも**件数ではなくドット**です(旧実装は「2」と固定表示していました)
- ベルをタップすると通知センターが開きます(旧実装は押しても何も起きませんでした)

改定が必要かどうかは、実際の画像と上記の差分を突き合わせてご判断ください。

## 過去セッション: v0.3.1 — iOS PWAセーフエリア余白修正・不要UI削除

作業指示書に基づき、developブランチ上で作業1〜4を別コミットで実施した。**mainへのマージ・タグ付けは行っていない**(依頼者が実施する取り決めのため)。iOS実機での最終確認も依頼者側で行う。

### 作業1: iOS PWA standaloneのタブバー下白帯を修正(`e56620f`)

原因調査は依頼者側で完了済みの前提で着手。`#app`が`height:100vh; height:100dvh`依存だったため、iOS standaloneでは`100dvh`がホームインジケータ領域を含まない高さを返し、アプリシェル全体がsafe-area分だけ短くなって、その下に`body`の地の色(`--bg`)が露出していた。

- `#app`([index.html:93付近](index.html:93))を`position:fixed; inset:0`に変更(`viewport-fit=cover`が既に指定されているため、safe-areaを含む画面全域に一致する)
- 保険として`html`の背景を`#FFFFFF`に設定(万一継ぎ目が残っても`#bottom-nav`の背景色と揃うため目立たない)
- `#bottom-nav`の`padding-bottom: env(safe-area-inset-bottom)`はそのまま維持、`position:fixed`には戻していない

**回帰リスク・実機確認すべき観点**: v0.2.3で「iOS standaloneにおいて`#main`の慣性スクロール中に`position:fixed`要素(当時の`#bottom-nav`)が追従しきれず揺れる」問題があり、`#bottom-nav`の`position:fixed`を撤去した経緯がある([index.html:169-173](index.html:169)のコメント参照)。今回`position:fixed`にしたのはスクロールしない**アプリシェル`#app`自体**であり、スクロールコンテナ`#main`はその内側に留まるため、同じ症状は原理的に起きにくいと考えられるが、**iOS実機での揺れの再発有無は必ず確認すること**。あわせて、タブバー下の白帯が実際に解消されているかも確認する。

### 作業2: 周知タブの「この通知への反応」を削除(`c9a0eec`)

`st.currentUid`ベースでローカルmutateのみ・Firestoreへの書き込み経路が無い未接続の凍結資産だったため全面削除した。

- 投稿詳細(driver向け)の反応UI・`reactions`配列・ボタン列・フィードバック確認テキスト
- `st.annFeedback`/`setAnnFb()`(ボタンの唯一の呼び出し元だったため合わせて削除)
- メンバー一覧の反応ピル — **指示書記載の2箇所(`showAnn`/`showReachPublic`)に加え、`showReach`にも同型の3箇所目があり、あわせて削除した**
- `showReach()`のリアクション集計・「反応」統計カード・「リアクション内訳」カード
  - **当初、統計カードが3枚→2枚になったことに合わせて共有クラス`.reach-stats`のCSS自体を`repeat(3,1fr)`→`repeat(2,1fr)`に変更してしまい、同じクラスを使うKYT管理画面(達成状況、カード3枚のまま)を2+1に折り返して崩す不具合を作り込んだ**(依頼者の指摘により発覚)。CSSは`repeat(3,1fr)`に戻し、お知らせ側の要素にのみ`style="grid-template-columns:repeat(2,1fr)"`をインライン指定する形に修正済み。**`.reach-stats`は お知らせ到達率詳細([index.html:4952](index.html:4952))と KYT達成状況([index.html:6246](index.html:6246))で共有されているクラスなので、今後カード枚数を変える際は必ず利用側で上書きすること。**
- `exportAnnCsv()`の「リアクション」列
- CSS `.reaction-pill`
- **モックデータ6件の`reactions:{...}`フィールドはオブジェクトごと削除した**(残置ではなく削除を選択。全読み取り箇所が消えるため残す理由がなく、凍結資産として維持しているreadBy/ackedByとは性質が異なると判断)
- 実データマッピング側の互換目的`reactions:{}`空オブジェクト付与も削除

`firestore.rules`にリアクション関連の許可ルールは元々存在しないことを確認済み(ルール変更なし、169件のテストに影響なし)。

### 作業3: 通知設定の「メール」表記を削除(`8fbb403`)

通知設定モーダルのサブタイトル「プッシュ通知 · メール」を「プッシュ通知」のみに修正([index.html:1984付近](index.html:1984))。`users.emailNotify`フィールド・`docs/archive/sendAnnouncementEmail/`は将来のメール通知実装のため手を付けていない。

### 作業4: 機能していない通知UIの除去(`1a9e38c`)

- ヘッダーの通知ベル(`.bell-btn`/`.bell-dot`)を削除。id/onclickも無くタップしても何も起きない v0.1 モック時代の飾りだった
- 周知タブのハードコードされた`<span class="nav-badge">2</span>`を削除。JSから更新されず未読0件でも常に「2」と表示され続ける誤情報だった
- `.nav-badge`のCSS自体は将来の未読バッジ実装で再利用するため残した。未読件数の算出ロジックは本バージョンのスコープ外(次バージョンで検討)

### バージョン・ドキュメント(`APP_VERSION`更新含む、この後のコミットで反映)

`APP_VERSION`を`'0.3.1'`に更新、`CHANGELOG`に`v0.3.1`エントリを追加。TECH_DEBT.md項目9に本セッションの内容を記録(反応機能・通知ベル/バッジは元々TECH_DEBT.mdに項目として存在しなかったため、既存項目の消し込みではなく新規記録)。

### 検証内容

- 全4作業についてブラウザプレビューで動作確認(driver/managerロールを模擬し、`showAnn`/`showReach`/`showReachPublic`/`exportAnnCsv`/`openAnnEditor`が例外を投げないこと、反応UI・ベル・バッジが完全に消えていること、既読・未読・到達率の表示自体は従来どおり機能することを確認)
- インラインscriptの構文チェック(`vm.Script`によるパース検証)を各コミット後に実施、エラーなし
- `firestore.rules`は変更していないため`npm run test:rules`は未実行(前回セッションの169件全passから変更なし)

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

**Stage2適用済み(2026-07-25)。`config/notifications.openToAllUsers`を`true`に更新した。** mainマージ・本番公開(develop→main `--no-ff`、`dda1ef9`、タグ`v0.3`)、VAPID鍵設定、Stage1(南野さんの実機での5イベント受信・ロック画面文言・タップ後の遷移・ログアウト時のトークン削除確認)を経て、南野さんの判断によりStage2へ移行した。

- サーバー側の値は認証済みREST API読み取りで`true`(更新時刻込み)を確認済み
- クライアント側の表示切替(`#um-notif-btn`の表示、`updateNotifMenuVisibility()`)は、Stage0時点で`openToAllUsers:true`を模擬注入して動作確認済み(このロジック自体はconfig変更の影響を受けない)
- **ブラウザの自動操作では実際の認証ログインを経由できないため、Stage2移行後に「一般ドライバーが実機/実際のログインでメニューに『通知設定』が表示されること」は本セッションでは直接確認できていない。** 南野さんまたはドライバーアカウントでの実機確認を推奨(HANDOFF.md記載の申し送り事項どおり)
- Stage0〜2の間の通知空白期間はこれで解消。旧機構撤去により一般ドライバーが通知機能を持たなかった期間は終了した

万一問題が見つかった場合は、`config/notifications.openToAllUsers`を`false`へ戻すだけでStage0相当に即座に戻せる(コード変更不要)。それでも解消しない場合は`v0.2.3-pre-fcm`タグへのロールバックを検討。

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
  8. **FCMプッシュ通知(v0.3)**: mainマージ済み・Stage1完了(2026-07-25、実機検証済み)・**Stage2適用済み(2026-07-25、`config/notifications.openToAllUsers`をtrueに更新)**。一般ドライバーへのメニュー項目表示は実機での最終確認が未実施(申し送り参照)。ユーザーコード変換規則(`myCode()`相当)がrulesとfunctionsの2箇所にある点も引き続き記録。
  12. **インライン`onclick`への文字列埋め込み(v0.4.2で対応予定)**: 予備軍3系統4箇所が未修正。調査は完了しており全量を記録済みなので**再調査不要**。暫定の運用回避策は「周知タグ・KYT選択肢・班チャンネル名に`"`と`'`を使わない」。
  13. v0.4.1で見送った2件(`manuals`の`fileUrl`/`storagePath`ホワイトリスト保護、手順書の`publishedAt`新設)。いずれも見送りの判断根拠付きで記録済み。

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
- **VAPID鍵は設定済み**: `index.html`の`FCM_VAPID_KEY`定数に南野さんがFirebase Consoleで生成した公開鍵を設定済み(v0.3)。公開鍵のためリポジトリに含めてよい。
- **ブラウザのスクリーンショットが取得できない場合がある**: Browserペインが非表示だと`computer{action:"screenshot"}`が「not compositing frames」で失敗する。その場合は`javascript_tool`での`getBoundingClientRect()`/`getComputedStyle()`実測と、実物のCSSを転記した比較用HTMLを`SendUserFile`で提出する方法で代替できる(v0.4.1のドット比較で実施)。

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

現在**189件**のルールテストが全pass(`test/rules/`に12ファイル: `users,reports,manuals,storage,kyt,teams,announcements,channels,sessions,tokens,config,badges`)。`firestore.rules`/`firestore.indexes.json`・Cloud Functions(8関数)・`index.html`ともv0.4としてmainへマージ・本番デプロイ済み。

## コミット時の運用ルール(このセッションで一貫していた点)

- `.claude/`(ローカルのdev-server起動設定`launch.json`)は毎回コミット対象外。
- `seed.html`は`.gitignore`で除外(実行後は毎回未追跡のまま)。
- コミット前に`git status`で意図しない差分がないか確認 → `npm run test:rules`全pass確認 → コミット → push、の順を徹底。
- 実機テストで本番Firestoreにテストデータを書き込んだ場合は、テスト直後に必ず削除して原状復帰する。**ただし`sessions`コレクションは`allow update, delete: if false`(追記のみ)のため、検証で作成したセッションレコード自体は削除できない**(`users.lastActiveDate`は自己更新可能なため元に戻せる)。
- **mainへのマージは指示がない限り行わない**。
- リモートに未取得のコミットがある場合は`git fetch`→`git rebase origin/develop`してからpushする。
- **作業開始時は必ず`git branch`で`develop`にいることを確認する**。以前、v0.2.3マージ後の`git checkout main`から戻し忘れ、`main`ブランチのまま実装を始めてしまった実績がある(コミット前に気づき`git checkout develop`で移し替えたため実害なし)。
- **新しいグローバル関数・定数を定義する前に、必ず全文検索で同名の有無を確認する**(南野さんの指示により毎回適用)。単一ファイル構成のため、既存の同名関数をエラーも警告もなく上書きして別機能を壊す事故が起こり得る(v0.4段階3で`fmtRelativeTime`が実際に発生)。実装後は重複カウントで機械的に検証すること。手順は[TECH_DEBT.md](TECH_DEBT.md)項目11に記載。
- **共有CSSクラスを変更する前に、必ず全使用箇所を確認する**。枚数など利用側ごとに異なる値はCSS本体ではなく利用側でインライン上書きする(v0.3.1で`.reach-stats`がKYT管理画面を巻き込んだ実績あり。同じくTECH_DEBT.md項目11)。
- 大きな機能は段階に分けて実装し、**各段階でコミット・報告してから次へ進む**(v0.4は5段階で実施)。段階ごとに実測での検証結果を添えると、仕様の取り違えを早期に発見できる。

## 次にやるとよさそうなこと(優先度は南野さん判断)

1. **[最優先]** v0.4.1のiOS実機確認(上記「次のセッションで最初に確認すること」の5項目)と、
   `--badge-dot-bell`の最終値(10px / 12px)の確定。
2. **[最優先の次]** v0.4.2: インライン`onclick`の予備軍3系統4箇所の修正(TECH_DEBT.md項目12)。
   **v0.4.1の実機確認完了後、間を空けずに着手する。** KYT選択肢に`"`が入るとそのシナリオが
   回答不能になるため。調査は完了しているので再調査は不要。
3. リリース後: マニュアル3点の追随(ドットのサイズ変更分。意味は変わらないため緊急性は低い)。
4. v0.3の残タスク: 一般ドライバーのメニューに「通知設定」が実際に表示されることを実機/実ログインで確認する(Stage2は`config/notifications.openToAllUsers`をtrueに更新済み。メニュー項目のゲート修正`96db84f`はStage1検証より後に入ったため未確認のまま)。問題があれば`config/notifications.openToAllUsers`を`false`に戻すだけでStage0相当に即座に戻せる。
5. v0.3.1の残タスク: iOS実機でタブバー下の白帯が解消されているか、`#app`の`position:fixed`化による揺れの回帰が無いかを確認(v0.3.2で`status-bar-style`を`default`に変更して対処済み)。
6. `st.currentUid`依存の残存箇所(モック周知データ・チャット未読・`recalcTeamCounts()`)を`fbUser.code`ベースへ統一(TECH_DEBT.md #1)。
7. 既存の壊れたCSSブロック([index.html:1039](index.html:1039)付近)の修正。`.role-menu`ルールが飲み込まれている(実害は軽微)。
8. 未実装のまま残っている機能: ゲームタブ(「近日公開」のプレースホルダーのみ)、周知タブの予約配信の
   自動公開(TECH_DEBT #4)、パスワードのセルフリセット(#3)、メール通知(#5・
   [docs/メール通知_将来実装メモ.md](docs/メール通知_将来実装メモ.md))。いずれも`functions/`基盤に
   乗せて実装できる状態です。
9. 次のリリースがあればREADME.mdのリリース手順に従う。
