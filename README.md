# matomete-app

## ブランチ運用

- `main`: **公開ブランチ**。GitHub Pages（`https://hanyama54321-cyber.github.io/matomete-app/`）はこのブランチのルートを配信している。現在はモック版（Firebase未接続）が公開中。
- `develop`: Firebase版（Firestore/Authentication連携）の開発ブランチ。バージョンアップリリースのタイミングで `main` へマージする。

## リリース手順（develop → main）

Firebase版を正式リリースする際は、以下の順で実施する。　

1. **事前確認（develop上で）**
   - Step 1〜7 で作成した確認手順（ログインテスト、パスワード変更、ユーザー管理、Firestoreルールのプレイグラウンド検証）を一通り再実施
   - `seed.html` は `.gitignore` で除外済み（GitHub Pagesには公開されない）。本番用デモユーザーがFirestoreに投入済みであることを確認
   - Firebase Authenticationの「承認済みドメイン」に `hanyama54321-cyber.github.io` が追加済みであることを確認
   - Firebase Authenticationの「ユーザーアクション → 作成（サインアップ）」が**無効化**されていることを確認（seed.html実行後に戻し忘れていないか）
   - Firestoreのセキュリティルールが `firestore.rules` の内容で公開済みであることを確認

2. **マージ**
   ```
   git checkout main
   git pull origin main
   git merge develop
   git push origin main
   ```

3. **公開後確認**
   - `https://hanyama54321-cyber.github.io/matomete-app/` から実際にログイン（乗務員コード + パスワード）できることを確認
   - 管理者アカウント（AAAAA/BBBBB/CCCCC）・乗務員アカウントそれぞれで表示が正しいことを確認

4. **切り戻しが必要な場合**
   - `git revert` で該当マージコミットを打ち消すか、`main` を直前のコミット（モック版）に `git reset --hard <直前コミット> && git push --force`（要相談・慎重に）で戻す

技術的負債・将来対応項目は [TECH_DEBT.md](TECH_DEBT.md) を参照。
