# matomete-app

## ブランチ運用

- `main`: **公開ブランチ**。GitHub Pages（`https://hanyama54321-cyber.github.io/matomete-app/`）はこのブランチのルートを配信している。v0.2以降、Firebase接続版が公開中。
  - **このリポジトリは public**。コミットした内容はそのまま公開される。管理者コードやパスワード運用が書かれた配布物（マニュアル類）を置かないこと（理由は [HANDOFF.md](HANDOFF.md) 参照）。
- `develop`: Firebase版（Firestore/Authentication連携）の開発ブランチ。バージョンアップリリースのタイミングで `main` へマージする。

## リリース手順（develop → main）

Firebase版を正式リリースする際は、以下の順で実施する。　

> **共通の約束**
> - マージは必ず `--no-ff`（`main` に各リリースのマージコミットを残すため）
> - **force push しない**。切り戻しはロールバック用タグを起点にする（手順7参照）
> - コンフリクトが出たら止めて相談する（`develop` と `main` は直系のはずなので、出た時点で想定外）
> - 途中で問題が出たら止めて報告する。自己判断で切り戻さない

1. **事前確認（develop上で）**
   - Step 1〜7 で作成した確認手順（ログインテスト、パスワード変更、ユーザー管理、Firestoreルールのプレイグラウンド検証）を一通り再実施
   - **ルールテストを回帰確認として実行し、全passを確認**（`firestore.rules` を変更していない場合も実施する）
     ```
     export PATH="/c/Program Files/Eclipse Adoptium/jre-21.0.11.10-hotspot/bin:$PATH"
     npm run test:rules
     ```
   - **`index.html` のインラインscriptを構文チェック**（CSSの構造を変えた場合は、ブラウザのCSSOMでルール総数と並びも確認する。セレクタ欠落や `}` の過不足は構文チェックでは検出できない）
   - `APP_VERSION` と `CHANGELOG` が今回の版になっていることを確認
   - **新着判定の仕組みを変えていない限り `BADGE_EPOCH` は更新しない。** マージ前に `git diff <前の版タグ> develop -- index.html` で差分が無いことを確認する
   - `seed.html` は `.gitignore` で除外済み（GitHub Pagesには公開されない）。本番用デモユーザーがFirestoreに投入済みであることを確認
   - Firebase Authenticationの「承認済みドメイン」に `hanyama54321-cyber.github.io` が追加済みであることを確認
   - Firebase Authenticationの「ユーザーアクション → 作成（サインアップ）」が**無効化**されていることを確認（seed.html実行後に戻し忘れていないか）
   - Firestoreのセキュリティルールが `firestore.rules` の内容で公開済みであることを確認

2. **ロールバック用タグを、マージ前の `main` 先端に作成**

   切り戻し先を確定させてからマージする。命名は `v<今の本番版>-pre-<変更の要約>`。
   ```
   git tag -a v0.4.1-pre-onclick-sweep <main先端> -m "v0.4.2リリース前のmain先端(ロールバック用)"
   git push origin v0.4.1-pre-onclick-sweep
   ```

3. **マージ（`--no-ff`）**

   まず `--no-commit` で流し、コンフリクトが無いことを確認してからコミットする。
   ```
   git checkout main
   git pull --ff-only origin main
   git merge --no-ff --no-commit develop     # コンフリクトが出たら止めて相談
   git diff --name-only --diff-filter=U      # 空であることを確認
   git commit                                 # メッセージは "Release vX.Y.Z: 概要"
   git diff develop main --stat               # 空＝内容一致 を確認
   git push origin main
   ```

4. **版タグを作成**
   ```
   git tag -a v0.4.2 -m "v0.4.2: 概要"
   git push origin v0.4.2
   ```

5. **公開後確認**
   - **GitHub Pages の反映を待つ**（30〜90秒。キャッシュを避けてクエリを付けて取得する）
     ```
     curl -s "https://hanyama54321-cyber.github.io/matomete-app/index.html?cb=$RANDOM" | grep -o "const APP_VERSION = '[^']*'"
     ```
   - ブラウザで開き、**バージョン表記が今回の版**であること・`hasFirebase` が `true` であること・コンソールエラーが無いことをライブ確認
   - `https://hanyama54321-cyber.github.io/matomete-app/` から実際にログイン（乗務員コード + パスワード）できることを確認
   - 管理者アカウント（AAAAA/BBBBB/CCCCC）・乗務員アカウントそれぞれで表示が正しいことを確認
   - **配布物4点の記述がこの版と合っているか突き合わせる**（リポジトリ外にあり自動追随しない）
     - 管理者向け運用マニュアル / ドライバー用ガイド / 早見表 / 全社展開のご案内（Slides）
     - 観点: バージョン表記 ／「今後の予定」に実装済みの機能が残っていないか ／ 撤去した機能の説明が残っていないか ／ 画面図解と実物の見た目
     - ずれていれば別途更新する（**リリース自体はブロックしない**）

6. **実機確認（依頼者が実施）**
   - iOS実機（PWAスタンドアロン）での確認は南野さんが行う取り決め。結果の報告を待つ
   - 実機確認が終わるまで `develop` に新しい変更を積まない（本番に入っているものを一意に保つため）

7. **切り戻しが必要な場合**
   - **`git push --force` は使わない。** `main` の履歴が壊れ、タグからの復元も難しくなる
   - 手順2で作成した**ロールバック用タグを起点に戻す**か、`git revert` で該当マージコミットを打ち消す
   - **実行の判断は依頼者が行う。** 自己判断で切り戻さず、問題を報告して指示を待つ

技術的負債・将来対応項目は [TECH_DEBT.md](TECH_DEBT.md) を参照。
