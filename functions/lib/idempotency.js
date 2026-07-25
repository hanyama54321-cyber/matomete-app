// before/after(Firestoreドキュメントのプレーンオブジェクト)の差分フィールド名一覧を返す
function diffKeys(before, after) {
  const b = before || {};
  const a = after || {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changed = [];
  keys.forEach((k) => {
    const bv = b[k];
    const av = a[k];
    // Firestore Timestamp同士はisEqualで比較、それ以外は簡易的にJSON文字列化して比較
    const same =
      bv && av && typeof bv.isEqual === 'function'
        ? bv.isEqual(av)
        : JSON.stringify(bv) === JSON.stringify(av);
    if (!same) changed.push(k);
  });
  return changed;
}

// 差分が指定したキー集合のみで構成されるか(自己再帰ガード用)。
// 変化が無い場合はガード対象ではないため false を返す(呼び出し元で個別判断する)
function diffIsOnly(before, after, keys) {
  const changed = diffKeys(before, after);
  if (changed.length === 0) return false;
  return changed.every((k) => keys.includes(k));
}

module.exports = { diffKeys, diffIsOnly };
