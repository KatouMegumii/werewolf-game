import pkg from 'pg';
const { Pool } = pkg;

let pool = null;

export function initDb() {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'werewolf',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  });

  // 创建表
  pool.query(`
    CREATE TABLE IF NOT EXISTS boards (
      id SERIAL PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      roles TEXT NOT NULL,
      summary TEXT NOT NULL,
      isFavorite BOOLEAN DEFAULT false,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, name)
    )
  `).catch(err => {
    console.error('创建表失败:', err);
  });

  console.log('✅ PostgreSQL 数据库初始化完成');
  return pool;
}

export function getDb() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return pool;
}

export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}


