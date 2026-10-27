'use strict';
const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const PROJECT_ID = 'anzen-matomete-app';

// node:test はテストファイルを並列(別プロセス)で実行するため、全ファイルが同じ
// projectIdを共有すると互いのclearFirestore()が衝突し、テストがフレーキーになる。
// テストファイルごとに独立したprojectId(名前空間)を割り当てて分離する。
// opts.storage:true を渡すとstorage.rulesも一緒に読み込み、Storageエミュレータに接続する。
// エミュレータの接続先。firebase emulators:exec が渡す環境変数を優先し、無ければ firebase.json の既定ポート。
// (別のプロジェクトのエミュレータが既定ポートを使っているときに、別ポートの設定で実行できるようにする)
function emulatorHostPort(envName, defaultPort) {
  const v = process.env[envName];
  if (!v) return { host: '127.0.0.1', port: defaultPort };
  const i = v.lastIndexOf(':');
  return { host: v.slice(0, i), port: Number(v.slice(i + 1)) };
}

async function createTestEnv(projectSuffix, opts) {
  const config = {
    projectId: projectSuffix ? `${PROJECT_ID}-${projectSuffix}` : PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8'),
      ...emulatorHostPort('FIRESTORE_EMULATOR_HOST', 8080),
    },
  };
  if (opts && opts.storage) {
    config.storage = {
      rules: fs.readFileSync(path.join(__dirname, '..', '..', 'storage.rules'), 'utf8'),
      ...emulatorHostPort('FIREBASE_STORAGE_EMULATOR_HOST', 9199),
    };
  }
  return initializeTestEnvironment(config);
}

// firestore.rules の myCode() はメールの@より前を大文字化したものを乗務員コードとみなす。
// 実運用の疑似メール(コード@matomete.local)と同じパターンでテスト用トークンを作る。
function authedContext(testEnv, code) {
  return testEnv.authenticatedContext(code, { email: `${code.toLowerCase()}@matomete.local` });
}

module.exports = { PROJECT_ID, createTestEnv, authedContext };
