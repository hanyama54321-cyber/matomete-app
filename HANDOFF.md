# 引き継ぎ書(2026-07-16時点)

新しいセッションで作業を再開する際は、まずこのファイルと [README.md](README.md)・[TECH_DEBT.md](TECH_DEBT.md) を読んでください。

## プロジェクト概要

- **リポジトリ**: `matomete-app`(安全配送まとめてアプリ)。単一ファイルSPA([index.html](index.html)、約7000行)+ Firebase(Firestore/Auth/Storage)。
- **ブランチ運用**: `main`=公開中のモック版(GitHub Pages)、`develop`=Firebase接続版(開発中)。リリース時は`develop`→`main`マージ(手順は[README.md](README.md)参照、**今回のセッションではmainへのマージは未実施**)。
- **Firebaseプロジェクト**: `anzen-matomete-app`(Blazeプラン、asia-northeast1)。

## これまでに完了した作業(直近コミット)

developブランチで、報告・手順書・KYTの3タブを**モック配列 → Firestore/Storage接続**へ移行済み(前セッションまで)。今回のセッションでは、ユーザーメニュー周り(乗務員マスタ・パスワード・班編成)を改修した。

### 今回のセッション: ユーザーメニュー改修

1. **teamsコレクションの生きたミラー化**: `index.html`が`teams`(9班マスター)をハードコードモック配列のまま使い続けていたギャップを解消。`attachTeamsListener()`を新設し、ログイン時からFirestore `teams`コレクションをonSnapshotミラーする(`attachManualsListener()`と同型)。
2. **パスワード変更の一本化**: 初回ログイン時の強制ダイアログ(`openPasswordChangeModal`等)を削除。プロフィール画面(`openProfileEdit`/`saveProfile`)を`fbUser`ベースに書き換え、パスワード変更(5文字以上に緩和)と所属班の自己変更(team_a〜team_i、team_i「安全指導班」含む)をここに統合。
3. **乗務員マスタ管理**: 既存の「ユーザー管理」画面を拡張し「乗務員マスタ」に統合(役割変更・新規登録・編集・削除を1画面に)。AAAAA/BBBBB/CCCCC(メンテナンス用管理者コード)は一覧から除外し影響を受けない。個別新規登録はFirestoreドキュメント作成のみで、**Authアカウントは作成しない**(意図的なスコープ限定、[TECH_DEBT.md](TECH_DEBT.md)参照)。
4. **班編成管理**: 新規admin画面(`openTeamManagement`)で班長名(team_a〜h)・呼称(team_i)を編集可能に。`seed-teams.js`と同じ計算式で`label`/`displayName`を再構成。
5. **CSV一括投入**: `seed.html`に⑧カード追加 + 新規`seed-drivers-csv.js`。差分マージ(既存コードは氏名のみ更新、CSVに無いコードは不変)、AAAAA/BBBBB/CCCCC除外、初期パスワード=コード自身。
6. **Firestoreルール変更**: `users/{code}`の自己更新に`team`単独更新を追加(team_a〜team_iホワイトリスト検証付き)。**デプロイ済み**。

### 前セッションまでの完了分

1. **報告タブ**(`2c0a1a3`): `reports`コレクション。ステータス管理(open/in_progress/resolved)・担当者アサイン・匿名投稿・公開承認制(private/pending_public/public)・PWA通知(アプリ起動中のみ)。`counters/reports`で受付番号をトランザクション採番。
2. **手順書タブ**(`2e087e4`): `manuals`コレクション + Cloud Storage(`manuals/{manualId}/{fileName}`)。ファイルアップロード・必読管理・既読率(`manuals/{id}/reads/{code}`サブコレクション)。
3. **KYTタブ**(`f711d3f`): `kyt`コレクション + `completions`サブコレクション(`kyt/{id}/completions/{code}`)。管理者ダッシュボードを1行圧縮+アコーディオン展開に刷新。

## 確立されたアーキテクチャパターン(次の機能もこれを踏襲すること)

新しいタブ/機能をFirestore化する際は、以下のパターンを流用する(手順書タブが最も典型的な参考実装):

- **onSnapshotミラー配列**: ログイン時(全ロール共通)に`attachXxxListener()`を開始し、`let xxx = []`をFirestoreの読み取り専用ミラーとして保持。ログアウト時に必ずunsubscribe(`showLoginScreen()`内)。
- **サブコレクション型の権限分離**: 「本人のみ書き込み可能な記録」(既読・完了記録など)は親ドキュメントとは別のサブコレクション(`{code}`をドキュメントIDに)に分離し、`code == myCode()`で本人一致を強制。
- **管理者のone-shot集計**: リアルタイムリスナーを張らず、タブ表示のたびに`fetchXxxAllDrivers()`(`users.where('role','==','driver')`)+`Promise.all`で各サブコレクションを取得してキャッシュ。読み取り課金対策。
- **なりすまし防止**: create時、`request.resource.data.xxxUid == myCode()`等をルールで検証(`reports`/`channels/messages`と同じパターン)。
- **本人の単一フィールド自己更新**: `users.team`のような「本人だけが特定の1フィールドだけ変更できる」パターンは、`request.resource.data.diff(resource.data).affectedKeys().hasOnly(['xxx'])`を条件に追加し、他フィールドとの同時変更を拒否する(`passwordChanged`と同じ形)。値のホワイトリスト検証(`in [...]`)も、その値を信頼する別のルール関数(`channelVisible()`等)がある場合は必須。
- **冪等シードスクリプト**: `seed-teams.js`/`seed-manuals.js`/`seed-kyt.js`と同型。固定ドキュメントIDで`.set()`、`db`・`log`引数を受け取る`seedXxx(db, log)`関数。`seed.html`にカード+ボタンを追加し、admin確認まで`disabled`。
- **CSV一括投入(差分マージ)**: `seed-drivers-csv.js`が確立したパターン。ドライラン(`seedXxxDryRun(db, csvText, log)`、書き込みなし)→承認→本実行(`seedXxxApply(db, ..., log, plan)`)の2段階。Auth作成が必要な場合はセカンダリFirebaseアプリ(`seederAuth`)を使い、メインの管理者セッションを汚染しない(`seed.html`の`app`/`seederApp`分離パターン)。
- **ルールテスト**: `test/rules/xxx.test.js`を`test/rules/manuals.test.js`と同水準で作成。`createTestEnv('xxx')`で名前空間分離(`test/rules/helpers.js`参照)。

## 未着手・既知の技術的負債

- **周知(announcements)タブ**: まだ完全モック(`const announcements = [...]`、[index.html:2501](index.html:2501)付近)。`firestore.rules`には既に`announcements`のルールが定義済みだが、アプリ側で`fbDb.collection('announcements')`を一切使っていない。次の移行候補。
- **ゲームタブ**: 「近日公開」のプレースホルダーのみ。実装なし。
- **[TECH_DEBT.md](TECH_DEBT.md)を参照**:
  1. モックusers配列とFirestore usersのuid統合(`st.currentUid`が`'u01'`/`'mgr'`に固定マッピングされている問題。KYT/報告/手順書/プロフィール/乗務員マスタは`fbUser.code`ベースに直したが、周知タブの既読(`readBy`)・チャット未読カウント・`recalcTeamCounts()`の人数集計等はまだ`st.currentUid`/モック`users`配列依存)
  2. 乗務員コードCSV一括投入ツール → **対応済み**(今回のセッション)
  2b. 個別登録時のAuthアカウント作成は意図的に未対応(スコープ限定)
  2c. 退職者削除後もAuthアカウントが残留する既知の穴(実害なし、将来のAuth作成実装時に設計が必要)
  3. パスワードセルフリセット機能(Cloud Functions要、設計のみ確定)

## 開発環境の状態(このマシン固有)

- **Firebase CLI**: `npx firebase-tools`(ローカルインストール不要、`node_modules/firebase-tools`にdevDependency済み)。**ログイン済み**(`hanyama54321@gmail.com`)。`firebase deploy`はそのまま実行可能なはず。
- **Java**: エミュレータ用に Temurin 21 JRE を `C:\Program Files\Eclipse Adoptium\jre-21.0.11.10-hotspot` にインストール済み(choco/winget経由、UAC承認が必要だった)。**Bashツールは新規セッションでこのPATHを引き継がない**ので、テスト実行前に毎回:
  ```
  export PATH="/c/Program Files/Eclipse Adoptium/jre-21.0.11.10-hotspot/bin:$PATH"
  npm run test:rules
  ```
- **GCP IAM設定済み**: Cloud Storageのセキュリティルールが`firestore.get()`でFirestoreをクロスサービス参照するため、サービスアカウント`service-163103621501@gcp-sa-firebasestorage.iam.gserviceaccount.com`に`roles/datastore.user`(Cloud Datastore ユーザー)を付与済み。これがないとStorageアップロードが`storage/unauthorized`で失敗する(既知の落とし穴、再発時はこれを疑う)。
- **ローカル動作確認用サーバー**: `python -m http.server 8791`をプロジェクトルートで起動し`http://localhost:8791/index.html`(や`/seed.html`)で確認する運用。**`file://`で直接開くとseed.htmlの`<script src>`読み込みに失敗することがある**(日本語パス起因の可能性、原因未確定)ので、必ずローカルサーバー経由で開くこと。

## テスト・デプロイ手順(次回も同じ)

```bash
# 1. ルールテスト(要Java PATH設定、上記参照)
npm run test:rules

# 2. rules + indexes をデプロイ
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project anzen-matomete-app

# Storageルールを変更した場合はこちらも
npx firebase-tools deploy --only storage --project anzen-matomete-app
```

現在103件のルールテストが全pass(`test/rules/{users,reports,manuals,storage,kyt,teams}.test.js`)。`firestore.rules`(users.team自己更新の追加)は今回のセッションで既にデプロイ済み。

## コミット時の運用ルール(このセッションで一貫していた点)

- `.claude/`(ローカルのdev-server起動設定`launch.json`)は毎回コミット対象外。
- `seed.html`は`.gitignore`で除外(実行後は毎回未追跡のまま)。
- コミット前に`git status`で意図しない差分がないか確認 → `npm run test:rules`全pass確認 → コミット → push、の順を徹底。
- **mainへのマージは指示がない限り行わない**。

## 次にやるとよさそうなこと(優先度は南野さん判断)

1. 南野さんから届いた実際の乗務員コードCSVを`seed.html`⑧カードから投入(ドライラン→内容確認→本実行)。
2. 周知タブのFirestore移行(既存パターンをそのまま踏襲できるはず)。
3. `st.currentUid`依存の残存箇所(周知既読・チャット未読・`recalcTeamCounts()`)を`fbUser.code`ベースへ統一(TECH_DEBT.md #1)。
4. mainへのリリース(develop動作確認が一通り終わったタイミングで、README.mdのリリース手順に従う)。
