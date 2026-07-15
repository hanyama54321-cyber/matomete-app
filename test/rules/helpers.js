'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'anzen-matomete-app';

// node:test はテストファイルを並列(別プロセス)で実行するため、全ファイルが同じ
// projectIdを共有すると互いのclearFirestore()が衝突し、テストがフレーキーになる。
// テストファイルごとに独立したprojectId(名前空間)を割り当てて分離する。
async function createTestEnv(projectSuffix) {
  return initializeTestEnvironment({
    projectId: projectSuffix ? `${PROJECT_ID}-${projectSuffix}` : PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

// firestore.rules の myCode() はメールの@より前を大文字化したものを乗務員コードとみなす。
// 実運用の疑似メール(コード@matomete.local)と同じパターンでテスト用トークンを作る。
function authedContext(testEnv, code) {
  return testEnv.authenticatedContext(code, { email: `${code.toLowerCase()}@matomete.local` });
}

module.exports = { PROJECT_ID, createTestEnv, authedContext };
