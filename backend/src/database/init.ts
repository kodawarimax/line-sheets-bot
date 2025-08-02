// src/database/init.ts - データベース初期化
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// データベースファイルの場所を設定
const dbPath = path.join(__dirname, '../../data/app.db');

// データディレクトリが存在しない場合は作成
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// データベース接続
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ データベース接続エラー:', err);
  } else {
    console.log('✅ SQLiteデータベースに接続しました');
  }
});

// テーブル作成SQL
const createTables = [
  // メッセージテーブル
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    sender_id TEXT,
    status TEXT DEFAULT 'pending',
    ai_analysis TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME
  )`,

  // AI設定テーブル
  `CREATE TABLE IF NOT EXISTS ai_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    model TEXT NOT NULL,
    temperature REAL DEFAULT 0.7,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
];

// データベース初期化関数
export const initializeDatabase = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // テーブルを順番に作成
      createTables.forEach(sql => {
        db.run(sql, (err) => {
          if (err) {
            console.error('❌ テーブル作成エラー:', err);
            reject(err);
            return;
          }
        });
      });

      console.log('✅ データベース初期化完了');
      resolve();
    });
  });
};

// SQL実行ヘルパー関数
export const runQuery = (sql: string, params: any[] = []): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

export { db };