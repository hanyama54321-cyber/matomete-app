// seed-drivers-csv.js
// 乗務員コードCSV一括投入(差分マージ)。初期導入用。
//
// CSVフォーマット: A列=未使用(空欄)、B列=乗務員コード(5桁英数字)、C列=氏名。
// ヘッダー行("氏名"・"乗務員コード"のいずれかの文字列を含む行)は自動でスキップする。
// ヘッダー行に列見出しがある場合はその位置を優先して氏名/コード列を判定し、
// ヘッダーが無い/見出し文字列が見つからない場合はB列=コード・C列=氏名の固定位置として扱う。
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
// ヘッダー行("氏名"/"乗務員コード"を含む行)は自動スキップし、見つかった位置を列マッピングに使う。
// ヘッダーが無い場合はB列(index1)=コード・C列(index2)=氏名の固定位置(A列は未使用)として扱う。
// 不正な行(コード非5桁・列数不足等)はinvalidへ回す。
function parseDriversCsv(text) {
  const stripped = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  const lines = stripped.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const rows = [];
  const invalid = [];
  const seenInFile = new Set();

  // デフォルト列位置(ヘッダー無しの場合): A列=未使用、B列=コード、C列=氏名
  let codeIdx = 1;
  let nameIdx = 2;
  let headerResolved = false;

  for (const line of lines) {
    const cols = line.split(',').map(c => c.trim());

    if (!headerResolved && (cols.includes('氏名') || cols.includes('乗務員コード'))) {
      const foundName = cols.indexOf('氏名');
      const foundCode = cols.indexOf('乗務員コード');
      if (foundName !== -1) nameIdx = foundName;
      if (foundCode !== -1) codeIdx = foundCode;
      headerResolved = true;
      continue; // ヘッダー行自体はスキップ
    }
    headerResolved = true; // 1行目がヘッダーでなければ以降もデフォルト位置を使う

    if (cols.length <= Math.max(codeIdx, nameIdx)) {
      invalid.push({ line, reason: `列数不足(${Math.max(codeIdx, nameIdx) + 1}列必要)` });
      continue;
    }

    const rawCode = cols[codeIdx];
    const rawName = cols[nameIdx];
    const code = (rawCode || '').toUpperCase();
    const name = (rawName || '').trim();
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

    // createdAtはv0.4のバッジ移行処理(since = max(BADGE_EPOCH, 登録時刻))が参照する。
    // これが無いと、リリース後に一括投入した乗務員に投入前の項目まで新着として湧く
    await db.collection('users').doc(u.code).set({
      name: u.name, role: 'driver', team: null, passwordChanged: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    log(`✓ Firestore新規作成: users/${u.code} (${u.name})`);
  }

  log(`=== 完了(更新${updatePlan.length}件・新規${createPlan.length}件) ===`);
}
