# 技術的負債・将来対応リスト

Firebase移行(モック→実Firebase)の過程で意図的に先送りした項目。

## 1. モックusers配列とFirestore usersの統合(uid紐付け)

Step 3で `10168 → u01`（モックusers配列内の南野）のように、Firestoreの乗務員コードを既存モックの `uid` へ暫定マッピングしている。既読管理(readBy)・KYT完了記録・チャット等、アプリ全機能がこのモックuid前提で作られているため、今回のスコープでは温存した。周知タブについては、実データ(Firestore, id=文字列)の既読・必読確認は`fbUser.code`ベースの`reads`サブコレクションに解消済み。既存モック6件(id=数値)のみ、従来の`st.currentUid`疑似動作を維持している(初期表示コンテンツとして凍結、編集・削除も不可)。

**対応時期**: 次フェーズ。全機能のデータ参照をFirestoreの乗務員コード基準に統一する。

## 1b. 周知タブの実データ既読率はFirestore usersのlist権限(admin限定)に依存

`firestore.rules`で`users`の`list`はadminのみ許可のため、実データ(Firestore)announcementsの到達率(reach%・既読/未読メンバー一覧)は管理者にのみ表示する(manuals/fetchManualsAllDriversと同じ制約)。一般ユーザーは自分の既読・必読確認はできるが、他メンバーの既読状況や到達率は見えない(モック6件は従来どおり両ロールに表示、影響なし)。

**対応時期**: 一般ユーザーにも到達率を見せたい場合は、`users`の`list`権限を緩和するか、到達率を別途集計するCloud Functionsを設ける等の設計変更が必要。

## 2. 乗務員コードCSV一括投入ツール(対応済み)

`seed.html`(⑧カード)+ `seed-drivers-csv.js` として実装済み。差分マージ(既存コードは氏名のみ更新、CSVに無いコードは不変)、AAAAA/BBBBB/CCCCC除外、初期パスワード=コード自身。

## 2b. 個別登録時のAuthアカウント作成は未対応

管理者メニュー「乗務員マスタ」からの個別新規登録(`index.html` `submitDriverCreate()`)はFirestoreドキュメントの作成のみで、Firebase Authアカウントは作成しない(スコープ外として意図的に見送り)。個別登録した乗務員は、CSV一括投入または`seed.html`側での手動対応をしない限りログインできない。

**対応時期**: 個別登録の都度Authアカウントも安全に作成できるようにするには、クライアント側の`createUserWithEmailAndPassword`直接呼び出し(常時「サインアップ」有効化が必要でセキュリティリスク)ではなく、Cloud Functions + Admin SDKでの実装が必要(下記項番3のパスワードリセット機能と基盤を共有できる)。**`functions/`基盤はFCMプッシュ通知実装(下記項番8)で新設済みのため、この基盤に乗せて対応可能。**

## 2c. 退職者削除後のAuthアカウント残留

乗務員マスタから`users`ドキュメントを削除しても、対応するFirebase Authアカウントは残り続ける(ログインはusersドキュメント不在チェックで既にブロックされるため実害は今のところない)。同一コードでの再入社時に、将来Authアカウントを作成する処理を実装した場合は`auth/email-already-in-use`で失敗する既知の穴がある。

**対応時期**: 個別登録のAuth作成(上記2b)を実装するタイミングで、削除時のAuthアカウント削除(またはre-create時の再利用)も合わせて設計する。

## 3. パスワード失念時のセルフリセット機能(採用決定済みの設計)

現行ログイン方式（乗務員コード→疑似メール `@matomete.local` への変換）では、Firebase標準のパスワードリセットメール機能が使えない（疑似メール宛にはメールが届かない）。

**採用済みの設計方針**:
- Firebase Authは疑似メールのまま維持する(変更しない)
- Firestoreの `users/{コード}` にユーザー任意登録の**実メールアドレス**を保持するフィールドを追加
- Cloud Functions + Admin SDKの `updateUser()` を使い、独自のパスワードリセットフロー(実メール宛にワンタイムトークン等を送付→検証→Admin SDKでパスワード更新)を実装する

**対応時期**: メール通知機能(周知タブ等で構想されている通知基盤)実装時にセットで対応。Cloud Functions・メール送信基盤を共有できるため。**`functions/`基盤はFCMプッシュ通知実装(下記項番8)で新設済み。**

**シークレット管理の方針**: サービスアカウント鍵(`serviceAccountKey.json`等)は`.gitignore`済み(誤コミット防止のため事前追加)。Cloud Functions導入時は`functions/.env`で環境変数として管理する(同様に`.gitignore`済み)。

## 4. 周知タブの予約配信は自動公開されない(手動publishNowのみ)

`scheduledAt`を過ぎても自動では公開されない。予約投稿は「下書き+予定時刻メモ」の位置づけで、公開は管理者が「今すぐ配信」を押した時のみ行われる(自動配信の仕組み=Cloud Functions等は未実装)。

**対応時期**: `functions/`基盤(下記項番8で新設済み)にスケジュール実行(Cloud Scheduler、`onSchedule`)を追加し、scheduledAt到来時に自動的にstatusをpublishedへ更新する処理を実装する想定。

## 5. 周知タブへのメール通知(将来構想。詳細は[docs/メール通知_将来実装メモ.md](docs/メール通知_将来実装メモ.md)参照)

将来的にセキュリティ問題がクリアできれば、希望者向けのメール通知機能を追加したい構想がある。報告タブで決定済みの「メール登録はいつでもできる仕様」およびパスワードセルフリセット構想(上記3. Firestoreに任意登録の実メール+Cloud Functions)と同じ基盤に乗る想定。設計・進め方の詳細は[docs/メール通知_将来実装メモ.md](docs/メール通知_将来実装メモ.md)にまとめる。

**過去の試作について(2026-07-25発見・退避・削除済み)**: 本アプリのCloud Functions基盤新設(FCMプッシュ通知実装)以前に、Firebase Consoleから直接デプロイされた試作関数`sendAnnouncementEmail`(git履歴になし)が本番に残っていた。`announcements/{docId}`の作成(`priority=='high'`または`mustRead`)をトリガーに、`users.emailNotify==true`のユーザーへ`nodemailer`(Gmail)でメール送信する内容だった。ソース内にGmailアプリパスワードが直書きされていたため、認証情報を`<REDACTED>`に置換したうえで`docs/archive/sendAnnouncementEmail/`(`function-describe.json`+`src/`)に退避し、本番の関数自体は削除した(詳細は同ディレクトリ参照)。該当のGmailアプリパスワードは南野さんにより失効済み。実装する際はこの試作を参考にできるが、**シークレットはソースへの直書きではなく`functions/.env`または Secret Manager で管理すること**。

## 6. LINE連携は見送り(決定記録)

LINE連携(LINEログイン・LIFF等)はセキュリティ上の懸念により見送り。将来の通知はメール(Firestore実メール+Cloud Functions基盤、上記3・5と同じ基盤)を優先する方針。コード・UI上のLINE関連の記述・実装(ログアウト説明文・アプリ情報画面の認証方式表示)はv0.2で削除済み。

## 7. チャットの読み取りコスト設計(limit是正のみ対応済み、残り2点は次フェーズ)

当初の設計メモ: 「初回50件+新着1件ずつ取得」「`persistentLocalCache`で再訪時の再読込を抑制」「90日超メッセージのアーカイブジョブは将来検討」。

- **初回件数(対応済み・v0.2)**: `attachChannelListener()`(`index.html`)を`orderBy('createdAt','desc').limit(50)`+クライアント側`reverse()`に変更。従来の`orderBy('asc').limit(100)`は「最も古い100件」を取得する形になっており、101件目以降の新着が表示されない実質的なバグを内包していたため、読み取りコスト是正と同時に機能修正も行った。**チャンネル切替のたびに`currentChannelUnsub()`→再購読**する既存実装は変更していないため、同じチャンネルに戻るたびに初期スナップショット分(最大50件)が再度読み取り課金される点は残る(下記`persistentLocalCache`未対応と合わせて次フェーズの課題)。
- **`persistentLocalCache`/`enablePersistence`(次フェーズ・単独対応可)**: 未実装。`index.html`の`const fbDb = firebase.firestore();`はデフォルト設定のままで、オフラインキャッシュは無効。有効化はアプリ全体で共有する`fbDb`インスタンスに影響するため、チャット以外の既存リスナー(announcements/manuals/kyt/reports/users)への影響確認を含めて対応する。
- **90日超メッセージのアーカイブジョブ(次フェーズ)**: 未実装。`functions/`基盤は項番8で新設済みのため、次に着手する際はスケジュール関数(`onSchedule`)を追加する形で対応できる。

## 8. FCMプッシュ通知(v0.3で実装。段階的展開はStage2まで完了)

このアプリで初めて`functions/`(Cloud Functions v2、Node 20、`asia-northeast1`)を新設した。5トリガー(`onAnnouncementNotify`/`onReportCreated`/`onReportReplyNotify`/`onManualCreated`/`cleanupStaleTokens`)+3callable(`sendUnreadReminder`/`subscribeToReport`/`estimateNotifyAudience`)。旧来の「アプリを開いている間だけ」の`Notification` API即時表示機構(`localStorage['fbNotifOptIn']`、`notifyNewReport`/`notifyNewAnnouncement`等)は撤去し、FCMに完全統合した。

**段階的展開(オプトイン・ゲート)の経緯**:
- Stage0(2026-07-25、mainマージ直後): 通知オプトインUIは`fbUser.role==='admin'`、または`config/notifications.openToAllUsers===true`のときのみ表示(`canShowNotifyOptIn()`)。`config/notifications`は`{openToAllUsers:false}`で本番Firestoreに作成
- Stage1(2026-07-25、南野さんの実機検証): iOS standalone / Androidの実機で5イベントの受信・ロック画面文言・タップ後の遷移・ログアウト時のトークン削除を確認済み
- **Stage2(2026-07-25、一般開放・適用済み)**: `config/notifications.openToAllUsers`を`true`に更新済み。**一般ドライバーが実際のログインでメニューに「通知設定」項目が表示されることの実機確認は未実施**(ブラウザ自動操作では認証ログインを経由できないため。南野さんまたはドライバーアカウントでの確認を推奨)。問題があれば`openToAllUsers`を`false`に戻すだけでStage0相当に即座に戻せる

**ユーザーコード変換規則の重複**: `request.auth.token.email`からユーザーコードを導く変換(`myCode()`相当)が、`firestore.rules`の`myCode()`と`functions/lib/auth.js`の`codeFromAuth()`の2箇所に存在する(SW/index.htmlのFirebase設定二重管理と同じ構図)。将来ログイン方式(疑似メールの形式等)を変える際は、両方を同時に直すこと。

**channels.lastMessageのFunctions移行は今回スコープ外**: v0.2で暫定的に一般ユーザーへ開放している`channels.lastMessage`単独更新ルールを、将来的にCloud Functions側へ寄せる案があったが(FCM導入時に検討、との位置づけだった)、チャットには一切プッシュ通知を送らない方針と無関係な既存の割り切りであり、今回のスコープには含めなかった。対応する場合は別タスクとして工数を見積もる。

**その他の既知の制約**: `firebase-functions-compat.js`は同一ページに`firebase-messaging`が読み込まれていると、callable呼び出しのたびに内部でFCMトークンを取得しようとする。`Notification.permission==='granted'`だがService Worker未登録の端末(通常は起きないが、VAPID鍵未設定時や初回登録が何らかの理由で失敗した場合)では、この内部処理が失敗しcallable呼び出し自体が失敗することを確認した(ローカル検証時に発見)。`registerFcmTokenIfPossible()`/`refreshFcmTokenIfNeeded()`がログイン時に確実にSW登録を試みる設計により通常は発生しないが、Stage1の実機検証で管理者操作系callable(`sendUnreadReminder`等)が原因不明で失敗する場合はこの可能性を疑うこと。

## 9. v0.3.1: セーフエリア余白修正・未接続UIの整理

- **iOS PWA standaloneのタブバー下白帯(修正済み)**: `#app`が`height:100dvh`依存だったため、iOS standaloneでホームインジケータ領域を含まない高さになりアプリシェル全体が短くなっていた。`#app`を`position:fixed;inset:0`(`viewport-fit=cover`前提)に変更して解消。`#bottom-nav`は`position:fixed`に戻していない(v0.2.3で揺れ問題により撤去した経緯があるため)。**iOS実機での最終確認は依頼者側で実施予定。**
- **周知タブの「この通知への反応」を削除(完了)**: `st.currentUid`ベースでローカルmutateのみ・Firestoreへの書き込み経路が無い未接続の凍結資産だったため全面削除した(UI・`setAnnFb()`・`showReach()`の反応集計・CSV出力列・CSS・モックデータの`reactions`フィールドを含む)。上記項目1の「モックusら配列統合」および今後の周知タブ改修時に、この機能が復活しないよう留意すること。
- **通知ベル・周知タブの固定バッジは未実装のため表示を撤去した(v0.4で実装済み)。** ヘッダーの`🔔`ベルはid/onclickも無くタップしても何も起きない飾りだった(削除済み)。周知タブの`<span class="nav-badge">2</span>`もJSから更新されず常に「2」を表示し続ける誤情報だった(削除済み)。**v0.4で通知センターとして実装し直し、ベルと新着マークの両方が実データに基づいて動くようになった(下記項目10)。**

## 10. 通知センターと各タブの新着マーク(v0.4で実装)

未読の情報源は`users/{code}/state/badges`(集約ドキュメント)と既存の`reads`サブコレクション。
**通知センター専用の既読フラグは作っていない。** タブごとに、通知センターとタブの新着マークが
同じ判定関数を見る設計(別系統で組むと必ず表示がズレるため)。

- 判定方式はタブごとに異なる: 周知・手順書は既存`reads`による項目単位、報告(管理者)・KYT・
  チャットは最終閲覧時刻との比較(時刻方式)、報告の回答は`replyUpdatedAt > replyReadAt`の比較
- 通知センターは既読を一切書き込まない。行タップは遷移のみで、既読化は遷移先の既存処理に委ねる
- 「すべて既読にする」は意図的に実装していない(一括既読は周知の到達率を無意味にするため)
- チャットは通知センターに載せない。そのためチャットに新着があってもベルは点灯せず、
  チャットタブのドットのみ点灯する(取り違えやすいので注意)

**`BADGE_EPOCH`(移行処理の足切り時刻)**: リリース直後に全乗務員へ過去分の新着が一斉に湧くのを
防ぐための定数。**mainへマージする直前に実際のリリース時刻へ更新する必要がある**(定数直上に
注意書きあり)。`since`は`max(BADGE_EPOCH, users.createdAt ?? Auth.metadata.creationTime)`で決まる。
`users.createdAt`はv0.4で新設したため既存ユーザーは持たないが、その場合はBADGE_EPOCHが採用され
仕様どおりに動く(バックフィル不要)。

**v0.4以前に保存された回答の既読状況は判定できない**: `replyUpdatedAt`がv0.4新設のため、
それ以前の回答は管理者UIで「既読状況は記録されていません(v0.4より前の回答)」と表示される。
この仕様により、過去の報告が一斉に未読として湧くことも防いでいる。

## 11. 単一ファイル構成に起因する事故パターン(再発防止のための記録)

`index.html`にすべてのCSS・JSが同居しているため、以下2種類の事故が実際に発生している。
**新規実装のたびに下記の確認を行うこと。**

**(1) 新規グローバル関数が既存の同名関数を静かに上書きする**
v0.4段階3で、通知センター用に定義した`fmtRelativeTime()`が既存の同名関数を上書きし、
お知らせ一覧の時刻表示(`annTimeLabel`)を壊した。同一スクリプトスコープの関数宣言は
後勝ちになるうえ、エラーも警告も出ないため、実際に壊れた画面を開くまで気づけない。

→ **対策**: 新しいグローバル関数・定数を定義する前に、必ず全文検索で同名の有無を確認する。
実装後は全`function`宣言を抽出して重複カウントを取る(以下で機械的に検出できる。
`signOut`が2件出るのは切り戻し用にコメントアウトされた旧実装のため正常):

```bash
node -e "const h=require('fs').readFileSync('index.html','utf8');const re=/^(?:async\s+)?function\s+([A-Za-z0-9_\$]+)\s*\(/gm;const s={};let m;while((m=re.exec(h)))s[m[1]]=(s[m[1]]||0)+1;console.log(Object.entries(s).filter(([,v])=>v>1))"
```

**(2) 共有CSSクラスの変更が無関係な画面を巻き込む**
v0.3.1で、周知の統計カードが3枚→2枚になったのに合わせて共有クラス`.reach-stats`の
`grid-template-columns`を`repeat(2,1fr)`に変更したところ、同じクラスを使うKYT管理画面
(カード3枚のまま)が2+1に折り返して崩れた。

→ **対策**: 共有クラスのCSSを変更する前に、必ず全使用箇所を`grep`で洗い出す。枚数など
利用側ごとに異なる値は、CSS本体ではなく**利用側でインライン指定して上書きする**
(`.reach-stats`は既定3列のままとし、お知らせ側だけ`style="grid-template-columns:repeat(2,1fr)"`
で2列にしている)。

**(3) インライン`onclick`に埋めた文字列でハンドラが静かに死ぬ**
同じ「エラーも警告も出ないまま壊れる」系統の3例目。v0.4.1で実際にバグとして表面化し、
v0.4.2で全件是正した。詳細と、今後クリックハンドラを書くときの作法は**項目12**に記載する。

**(4) セレクタを失ったCSS宣言ブロックが後続ルールを飲み込む**
4例目。CSSは`vm.Script`の構文チェックで検出できないため、`index.html`の初回コミットから
v0.4.2まで気づかれずに残っていた。詳細と確認手順は**項目14**に記載する。

## 12. インライン`onclick`への文字列埋め込みでハンドラが静かに死ぬ(v0.4.1・v0.4.2で対応済み)

> **対応済み**: 主バグはv0.4.1、予備軍3系統4箇所はv0.4.2で修正した。
> 以下は事故パターンの記録として残す。**同じ書き方をしないこと。**

### 事故パターン

値をJS文字列としてHTML属性に埋めると、**値に引用符が含まれた時点で属性値がそこで終端し**、
残りが迷子の属性になる。結果ハンドラはJSとして構文エラーになりコンパイルされず、
`el.onclick === null` となって**エラーも出ないままボタンが無反応になる**。
`escHtml()`はこの文脈では効かない(むしろ逆効果)。`&quot;`/`&#39;`は属性のパース時に
生の`"`/`'`へデコードされ、その後でJS層に渡るため。

### v0.4.1で修正済み(主バグ)

`openManEditor()`の保存ボタンが`onclick="saveManEditor(${JSON.stringify(id)})"`だったため、
`JSON.stringify('abc123')`が生のダブルクォート付き`"abc123"`を出力して属性を破壊していた。
**手順書のタイトル・説明を編集しても無言で保存できない**という症状で表面化。
新規追加時は`id === null`→`null`(クォートなし)のため壊れず、編集時だけ発生していた。
インライン`onclick`を廃止し`addEventListener`で結線する方式へ変更済み。

### v0.4.2で修正済み(予備軍3系統4箇所)

インライン`onclick`に文字列引数をテンプレートリテラルで埋めている箇所を**全56種洗い出した**。
大半はFirestore自動ID・乗務員コード・固定配列(`manualCategories`等)で引用符が入り得ず安全。
**自由入力テキストを埋めている3系統4箇所が予備軍**で、実ブラウザで壊れることを確認済み
(いずれも`typeof el.onclick !== 'function'`になる):

| 箇所 | 値の出所 | 実測した壊れ方 |
|---|---|---|
| `index.html:4458` `setTagFilter` / `4778` `goToTagThread` | 周知タグ(`#ed-tag-input`の自由入力) | `'`はエスケープ済みだが`"`が未処理 → 属性が切れる(主バグと同型) |
| `index.html:7030` `toggleKYT` | KYT選択肢(管理者の自由入力) | 同上。選択肢に`"`があると**そのシナリオが回答不能**になる |
| `index.html:6021` `switchCh` | 班チャンネル表示名(班編成管理で編集可) | `escHtml`の`&#39;`が属性デコードで`'`に戻りJS文字列を破壊 |

→ **採った修正方針(今後も同じ書き方をすること)**: 値を`data-*`属性に`escHtml()`で入れ、
innerHTML代入と同じ関数内の直後で`addEventListener`を張る。`data-*`属性ならJS層を
経由しないため、パーサがデコードした生の文字列がそのまま取り出せ、引用符を含んでも壊れない。

共通ヘルパー`bindDataClick(root, attr, handler)`(`escHtml()`の直前に定義)を経由する。
属性名は`data-ann-tag`(一覧)/`data-ann-thread-tag`(詳細)/`data-kyt-opt`/
`data-ch-id`・`data-ch-label`。一覧と詳細で属性名を分けているのは遷移先が異なるため
(前者はフィルタのみ、後者は詳細を閉じてからフィルタ)。

**イベント委譲ではなく要素への直接バインドにすること。** 周知一覧のタグはカード側の
`onclick="showAnn(...)"`より内側にあり`e.stopPropagation()`が必要で、委譲にすると
カードのinline onclickが先に発火して詳細画面が開いてしまう。

修正した関数: `renderAnn()` / `renderAnnDetailBody()` / `drawKYTQuiz()` / `renderChannelChips()`

あわせて、同じ行にあったタグ名・選択肢の**表示側の未エスケープ**(`${t}`の生挿入)も
`escHtml()`に揃えた。属性側だけ直しても`<`を含む値で描画が崩れるため。

`insertCannedReply`(`index.html:7876`)も同型だが、値が`REPLY_CANNED_PHRASES`
(`index.html:2898`)のソース直書き定数で引用符を含まないため対象外とした。

**v0.4.2での検証結果**(実際の描画関数を通した前後比較):
修正前は4系統とも`typeof el.onclick !== 'function'`で無反応。修正後は4系統とも
正しい引数で発火し、`安全"重要`(タグ)・`前方を"確認"していない`(KYT選択肢)・
`A'班`(班名)がそのまま渡ることを確認。一覧タグのクリックで詳細画面が開かないこと
(stopPropagationの維持)、KYTは未採点なら選択でき採点後は`data-kyt-opt`が出ず
選択できないことも確認済み。

## 13. v0.4.1で検討し、見送った2件

### (a) `manuals`の`fileUrl`/`storagePath`のホワイトリスト保護

`firestore.rules:245`は`allow create, delete, update: if isAdmin();`で、adminはファイル本体を
指すフィールドも書き換えられる。ただし**admin限定であり、削除→再作成も可能である以上、
実効的な防御にはならない**ため見送った。

実施する場合のキー範囲(編集モーダルが実際に書き込む7フィールド + `saveManMustRead()`):
`title, description, category, icon, mustRead, readDeadline, updatedAt`。
**`title`/`description`/`updatedAt`の3キーだけに絞ると、編集モーダル(`index.html:6648`)と
`saveManMustRead()`(`index.html:6446`)の両方が`permission-denied`になる**ので注意。

### (b) 手順書の`publishedAt`新設

「編集すると新着として再通知されてしまう」ことを前提に検討したが、**この前提が誤りだった**。

- `unreadManuals()`(`index.html:3370`)は`m.createdAt`のみ参照。`updatedAt`は不使用
- Cloud Functionは`onDocumentCreated`のため、編集ではプッシュも飛ばない
- → **編集しても新着は再点灯しない。「静かに反映」は現行実装で既に満たされている**

よって`publishedAt`は挙動を一切変えない構造分離のみとなり、データモデル追加＋全件バックフィルを
パッチリリースに含める理由がないと判断した。周知側に`publishedAt || createdAt`のフォールバック
前例がある(`index.html:4541`)ため、将来「この編集は新着として知らせる」を選択制にしたく
なった時点で同じパターンで追加すればよい。**後から入れるコストが低いことが分かったので今は入れない**、
という判断。

## 14. セレクタを失ったCSS宣言ブロックが後続ルールを飲み込む(v0.4.2で対応済み)

> **対応済み**: v0.4.2で孤児ブロックを削除し、`.role-menu`の巻き込みを解消した。
> 以下は事故パターンの記録として残す。

### 症状

`index.html:1039`付近、`.reach-mini-public:hover`の直後に**セレクタ行を失った宣言ブロック**がある。

```css
.reach-mini-public:hover { background: rgba(26,86,196,.1); }
  position: absolute;              /* ← ここにセレクタが無い */
  bottom: -2px; right: -2px;
  background: #FFB300;
  color: white;
  font-size: 8px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 6px;
  border: 1.5px solid white;
  letter-spacing: .04em;
  line-height: 1;
}
.role-menu { ... }
```

CSSパーサはセレクタを探して`{`まで読み飛ばそうとするため、**エラー回復の過程で後続のルールを
巻き込んで捨てる**。実測で`.role-menu`がCSSOM上に存在しないことを確認済み
(ルール一覧が`.reach-mini-public:hover`から`.role-menu-item`へ飛ぶ):

```js
[...document.styleSheets].find(s => s.cssRules.length > 100).cssRules
// → .role-menu が無い
```

初回コミット`cc3b749 Add files via upload`から存在する。`.role-menu`は無効化済みの
開発用ロール切替メニュー(`#role-menu`、`setRole('driver')`/`setRole('manager')`。
`showAdminToggle()`はFirebase認証導入時にコメントアウト済み)のスタイルで、
要素側に`style="top:50px;right:16px"`のインライン指定もあるため**実害は軽微**。

### v0.4.2で実施したこと

**1. 飲み込まれている範囲の終端をCSSOMで実測して確定させた。**
孤児ブロックに仮のセレクタを与えた版と現状とを同じパーサに通して差分を取る方法で測定:

```js
// 322ルール(現状) vs 324ルール(仮セレクタ付与時)。差の2件は
// .role-menu と検証用の仮セレクタ自身 → 消えているのは .role-menu の1ルールのみ
```

`.role-menu-item`以降は正常にパースされており、**影響範囲は`.role-menu`だけ**と確定した。

**2. 孤児ブロックは出自を特定できなかったため、未使用として削除した。**
- 初回コミット`cc3b749`の時点で既にセレクタを持っておらず、git履歴に手掛かりが無い
- DOMに存在するクラスのうちCSSルールを持たないものは0件で、対応する要素が無い
- 内容は何かのアイコン右下に重ねる小バッジだが、該当する要素がアプリ内に存在しない

**3. 修正後の検証。**
- ルール総数 322 → 323。`.reach-mini-public:hover` → `.role-menu` → `.role-menu-item` の
  並びに是正された
- `.role-menu`に一致する要素は**0件**。`#role-menu`は「Firebase認証導入に伴い無効化。
  切り戻し用に残置」としてHTMLコメント内にあるため、ルールが復活しても描画対象が無い
- レイアウト不変を前後比較で実測。`#app`配下497要素の位置(x,y)と寸法(w,h)を全件
  突き合わせ、**差分0件**

### 再発防止

CSSの構造を変えたあとは、**ルール総数とCSSOM上の並びを確認する**こと。
セレクタの欠落・`}`の過不足はどれも「後続ルールが無言で消える」形で表面化し、
`vm.Script`の構文チェックでは検出できない(CSSはJSではないため)。

```js
const s = [...document.styleSheets].find(x => x.cssRules.length > 100);
[...s.cssRules].length;                                    // ルール総数
[...s.cssRules].map(r => r.selectorText).indexOf('.対象');  // 期待する位置にあるか
```
