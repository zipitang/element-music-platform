"""
初始化元素音乐数据库
创建所有必要的表结构
"""
import sqlite3
import os

DB_PATH = '/opt/element-music/server/db/element_music.db'

# 如果数据库文件不存在，创建它
if not os.path.exists(DB_PATH):
    open(DB_PATH, 'w').close()

# 连接数据库
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# 创建用户表
cursor.execute('''
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT DEFAULT 'user',
  nickname      TEXT DEFAULT '',
  avatar        TEXT DEFAULT '',
  status        INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
)
''')

# 创建其他必要的表（简化版本，只包含用户相关）
print('✅ 用户表创建成功')

# 检查是否已有admin用户，如果没有则创建
cursor.execute('SELECT COUNT(*) FROM users WHERE username = ?', ('admin',))
if cursor.fetchone()[0] == 0:
    # 创建默认admin用户（密码：admin123）
    import hashlib
    password_hash = hashlib.sha256('admin123'.encode()).hexdigest()
    cursor.execute('''
    INSERT INTO users (username, password_hash, role, nickname, status, created_at, updated_at)
    VALUES (?, ?, 'admin', '管理员', 1, datetime('now'), datetime('now'))
    ''', ('admin', password_hash))
    print('✅ 默认admin用户创建成功 (用户名: admin, 密码: admin123)')

conn.commit()
conn.close()

print(f'\n🎵 数据库初始化完成: {DB_PATH}')
