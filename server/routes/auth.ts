/**
 * ============================================================
 *  认证路由 — 登录 / 退出 / 当前用户信息
 * ============================================================
 */
import { Router } from 'express';
import db from '../db/index.js';
import { sha256, signToken, verifyToken } from '../services/auth.js';

export const router = Router();

/* ============ 登录失败限流（防暴力猜解） ============ */
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_FAILS = 8;
const loginFails = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: any): string {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket?.remoteAddress || 'unknown';
}

function isBlocked(ip: string): boolean {
  const rec = loginFails.get(ip);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) { loginFails.delete(ip); return false; }
  return rec.count >= LOGIN_MAX_FAILS;
}

function markFail(ip: string) {
  const now = Date.now();
  const rec = loginFails.get(ip);
  if (!rec || now > rec.resetAt) loginFails.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  else rec.count += 1;
  if (loginFails.size > 5000) loginFails.clear();
}

/** POST /api/auth/register — 用户注册（含确认密码） */
router.post('/register', (req, res) => {
  const { username, password, confirmPassword, nickname } = req.body || {};

  // 1. 验证必填字段
  if (!username || !password || !confirmPassword) {
    return res.status(400).json({ success: false, error: '请填写所有必填字段' });
  }

  // 2. 验证用户名格式
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ success: false, error: '用户名必须为3-20位字母、数字或下划线' });
  }

  // 3. 验证密码长度
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: '密码长度至少为6位' });
  }

  // 4. 验证确认密码
  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, error: '两次输入的密码不一致' });
  }

  // 5. 检查用户名是否已存在
  const existingUser = db.getDB().exec(
    'SELECT id FROM users WHERE username = ? AND is_deleted = 0',
    [username],
  );
  if (existingUser.length && existingUser[0].values.length) {
    return res.status(400).json({ success: false, error: '用户名已存在' });
  }

  // 6. 创建新用户（默认角色为 user）
  const hash = sha256(password);
  try {
    db.getDB().exec(
      `INSERT INTO users (username, password_hash, role, nickname, status, created_at, updated_at)
       VALUES (?, ?, 'user', ?, 1, datetime('now'), datetime('now'))`,
      [username, hash, nickname || username],
    );
    // sql.js 的 INSERT 不返回 rowid，需要单独查询
    const rowId = db.getDB().exec('SELECT last_insert_rowid() as rid');
    const newUserId = (rowId[0]?.values?.[0]?.[0]) ?? 0;
    db.log('register', 'user', newUserId, username);
    res.json({ success: true, message: '注册成功，请登录', data: { username } });
  } catch (err) {
    console.error('[REGISTER] 注册失败:', err);
    res.status(500).json({ success: false, error: '注册失败，请稍后重试' });
  }
});

/** POST /api/auth/login */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '请输入用户名和密码' });
  }

  const ip = clientIp(req);
  if (isBlocked(ip)) {
    return res.status(429).json({ success: false, error: '尝试过于频繁，请 5 分钟后再试' });
  }

  const row = db.getDB().exec(
    'SELECT * FROM users WHERE username = ? AND is_deleted = 0 AND status = 1',
    [username],
  );
  if (!row.length || !row[0].values.length) {
    markFail(ip);
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }

  const cols = row[0].columns;
  const vals = row[0].values[0];
  const user: Record<string, any> = {};
  cols.forEach((c, i) => { user[c] = vals[i]; });

  const hash = sha256(password);
  if (hash !== user.password_hash) {
    markFail(ip);
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }

  loginFails.delete(ip);
  const token = signToken(user.username, user.role);
  const { password_hash, is_deleted, ...safeUser } = user;

  db.log('login', 'user', user.id, user.username);
  res.json({ success: true, data: { token, user: safeUser } });
});

/** GET /api/auth/me */
router.get('/me', (req, res) => {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  const payload = verifyToken(auth.slice(7));
  if (!payload) {
    return res.status(401).json({ success: false, error: '登录已过期' });
  }

  const row = db.getDB().exec(
    'SELECT id, username, role, nickname, avatar, status, created_at, updated_at FROM users WHERE username = ? AND is_deleted = 0',
    [payload.username],
  );
  if (!row.length || !row[0].values.length) {
    return res.status(401).json({ success: false, error: '用户不存在' });
  }

  const cols = row[0].columns;
  const vals = row[0].values[0];
  const user: Record<string, any> = {};
  cols.forEach((c, i) => { user[c] = vals[i]; });

  res.json({ success: true, data: user });
});

/** POST /api/auth/logout */
router.post('/logout', (_req, res) => {
  res.json({ success: true, message: '已退出' });
});

export default router;
