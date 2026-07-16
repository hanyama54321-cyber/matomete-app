// seed-drivers-csv.js
// 乗務員コードCSV一括投入(差分マージ)。初期導入用。
//
// CSVフォーマット: 1列目=氏名、2列目=乗務員コード(5桁英数字)。
// 1行目がヘッダー("氏名"を含む)の場合は自動でスキップする。
//
// 差分マージ仕様:
//   - 既存コード(users doc既存) → 氏名のみ更新。team/role/passwordChanged等は一切触らない(温存)
//   - 新規コード              → Auth作成(初期PW=コード自身、index.html/seed.htmlと同じEMAIL_DOMAIN/PW_SUFFIX)
//                                + Firestore doc新規作成(role:'driver', team:null, passwordChanged:false)
//   - CSVに存在しない既存コード → 一切触らない(自動削除・無効化なし)
//   - AAAAA/BBBBB/CCCCC(メンテナンス用管理者コード) → 常にスキップ(除外ログ)
//   - "10168"はテストユーザーにつき保護対象外(通常のupdate/create対象)
//
// db: firebase.firestore()のメインアプリインスタンス(Firestore書込用)。
// seederAuth: seed.htmlのセカンダリFirebaseアプリのauth()インスタンス(Auth作成専用、
//             createUserWithEmailAndPasswordの自動ログインをメイン管理者セッションから隔離するため)。
// log: ログ出力用コールバック(引数1つ、文字列)。

const DRIVERS_CSV_EXCLUDED_CODES = new Set(['AAAAA', 'BBBBB', 'CCCCC']);
const DRIVERS_CSV_EMAIL_DOMAIN = '@matomete.local'; // index.html/seed.htmlのEMAIL_DOMAINと一致させること
const DRIVERS_CSV_PW_SUFFIX = '_mtm';               // index.html/seed.htmlのPW_SUFFIXと一致させること

// CSVテキストを [{code, name}] にパースする。BOM除去・CRLF/LF両対応。
// ヘッダー行("氏名"を含む行)は自動スキップ。不正な行(コード非5桁等)はinvalidへ回す。
function parseDriversCsv(text) {
  const stripped = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = stripped.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const rows = [];
  const invalid = [];
  const seenInFile = new Set();

  for (const line of lines) {
    const cols = line.split(',').map(c => c.trim());
    if (cols.length < 2) { invalid.push({ line, reason: '列数不足(氏名,コードの2列が必要)' }); continue; }
    const [rawName, rawCode] = cols;
    if (rawName === '氏名' || rawCode === '乗務員コード') continue; // ヘッダー行スキップ

    const code = rawCode.trim().toUpperCase();
    const name = rawName.trim();
    if (!/^[A-Z0-9]{5}$/.test(code)) { invalid.push({ line, reason: `コード形式不正: ${rawCode}` }); continue; }
    if (!name) { invalid.push({ line, reason: '氏名が空です' }); continue; }
    if (seenInFile.has(code)) { invalid.push({ line, reason: `CSV内で重複したコード: ${code}` }); continue; }
    seenInFile.add(code);
    rows.push({ code, name });
  }

  return { rows, invalid };
}

// ドライラン: 書き込みなしで既存usersと突合し、計画のみ返す
async function seedDriversCsvDryRun(db, csvText, log) {
  log('=== 乗務員CSV ドライラン 開始 ===');
  const { rows, invalid } = parseDriversCsv(csvText);

  const snap = await db.collection('users').get();
  const existing = new Map();
  snap.forEach(doc => existing.set(doc.id, doc.data()));

  const updatePlan = [];
  const createPlan = [];
  const excluded = [];

  for (const row of rows) {
    if (DRIVERS_CSV_EXCLUDED_CODES.has(row.code)) {
      excluded.push(row);
      log(`- 除外(メンテナンス用予約コード): ${row.code}`);
      continue;
    }
    const cur = existing.get(row.code);
    if (cur) {
      if (cur.name !== row.name) {
        updatePlan.push({ code: row.code, oldName: cur.name || '', newName: row.name });
      }
      // 氏名が同じ場合は差分なし(何もしない)
    } else {
      createPlan.push({ code: row.code, name: row.name });
    }
  }

  log(`--- 集計: 更新${updatePlan.length}件 / 新規${createPlan.length}件 / 除外${excluded.length}件 / 不正行${invalid.length}件 ---`);
  invalid.forEach(i => log(`✗ 不正行スキップ: ${i.line} (${i.reason})`));

  return { updatePlan, createPlan, excluded, invalid, total: rows.length };
}

// 本実行: ドライランのplanのみを反映する(CSVに存在しない既存コードは一切触らない)
async function seedDriversCsvApply(db, seederAuth, log, updatePlan, createPlan) {
  log('=== 乗務員CSV 本実行 開始 ===');

  for (const u of updatePlan) {
    await db.collection('users').doc(u.code).update({ name: u.newName });
    log(`✓ 氏名更新: users/${u.code} 「${u.oldName}」→「${u.newName}」`);
  }

  for (const u of createPlan) {
    const email = u.code + DRIVERS_CSV_EMAIL_DOMAIN;
    const password = u.code + DRIVERS_CSV_PW_SUFFIX; // 初期パスワード=コード自身(index.html/seed.htmlと同じサフィックス組み立て)

    try {
      await seederAuth.createUserWithEmailAndPassword(email, password);
      log(`✓ Auth作成: ${email}`);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        log(`- Authスキップ(既存): ${email}`);
      } else {
        throw e;
      }
    }
    await seederAuth.signOut(); // セカンダリアプリ側のみサインアウト。メインdbの管理者セッションには無関係

    await db.collection('users').doc(u.code).set({
      name: u.name, role: 'driver', team: null, passwordChanged: false,
    });
    log(`✓ Firestore新規作成: users/${u.code} (${u.name})`);
  }

  log(`=== 完了(更新${updatePlan.length}件・新規${createPlan.length}件) ===`);
}
