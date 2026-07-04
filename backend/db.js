import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'werewolf.db');

let db = null;

export function initDb() {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // 创建用户板子表
  db.exec(`
    CREATE TABLE IF NOT EXISTS boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      roles TEXT NOT NULL,
      summary TEXT NOT NULL,
      isFavorite BOOLEAN DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, name)
    );
  `);

  console.log('✅ 数据库初始化完成:', dbPath);
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

