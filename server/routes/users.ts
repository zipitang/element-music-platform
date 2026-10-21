/**
 * ============================================================
 *  用户管理路由 — 仅管理员可操作
 * ============================================================
 */
import { Router } from 'express';
import db from '../db/index.js';
import { sha256, verifyToken } from '../services/auth.js';

export const router = Router();

/** 管理员鉴权中间件 */
function requireAdmin(req: any, res: any, next: any) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  const payload = verifyToken(auth.slice(7));
  if (!payload) return res.status(401).json({ success: false, error: '登录已过期' });
  if (payload.role !== 'admin') return res.status(403).json({ success: false, error: '无权限' });
  req._auth = payload;
  next();
}

/** GET /api/users — 用户列表 */
router.get('/', requireAdmin, (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const q = (req.query.q as string) || '';

  let where = 'is_deleted = 0';
  const params: any[] = [];
  if (q) { where += ' AND (username LIKE ? OR nickname LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  const cols = 'id, username, role, nickname, avatar, status, created_at, updated_at';
  const total = db.getDB().exec(`SELECT COUNT(*) as cnt FROM users WHERE ${where}`, params);
  const totalCnt = total.length > 0 ? Number(total[0].values[0][0]) : 0;

  const r = db.getDB().exec(
    `SELECT ${cols} FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params,
  );

  const items = r.length > 0 ? r[0].values.map((row: any) => {
    const obj: Record<string, any> = {};
    r[0].columns.forEach((c: string, i: number) => { obj[c] = row[i]; });
    return obj;
  }) : [];

  res.json({ success: true, data: { items, total: totalCnt, page, limit } });
});

/** GET /api/users/:id — 用户详情 */
router.get('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const r = db.getDB().exec(
    'SELECT id, username, role, nickname, avatar, status, created_at, updated_at FROM users WHERE id = ? AND is_deleted = 0',
    [id],
  );
  if (!r.length || !r[0].values.length) {
    return res.status(404).json({ success: false, error: '用户不存在' });
  }
  const obj: Record<string, any> = {};
  r[0].columns.forEach((c: string, i: number) => { obj[c] = r[0].values[0][i]; });
  res.json({ success: true, data: obj });
});

/** POST /api/users — 创建用户 */
router.post('/', requireAdmin, (req, res) => {
  const { username, password, nickname, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
  }

  // 检查重名
  const exist = db.getDB().exec('SELECT id FROM users WHERE username = ? AND is_deleted = 0', [username]);
  if (exist.length > 0 && exist[0].values.length > 0) {
    return res.status(409).json({ success: false, error: '用户名已存在' });
  }

  const id = db.insert('users', {
    username,
    password_hash: sha256(password),
    role: role || 'user',
    nickname: nickname || username,
    status: 1,
  });

  db.log('create', 'user', id, username);
  res.json({ success: true, data: { id, username, role: role || 'user', nickname: nickname || username } });
});

/** PATCH /api/users/:id — 更新用户 */
router.patch('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.queryOne('users', id);
  if (!row) return res.status(404).json({ success: false, error: '用户不存在' });

  const { nickname, role, status, password } = req.body || {};
  const updates: Record<string, any> = {};

  if (nickname !== undefined) updates.nickname = nickname;
  if (role !== undefined) updates.role = role;
  if (status !== undefined) updates.status = status;
  if (password) updates.password_hash = sha256(password);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ success: false, error: '无更新内容' });
  }

  db.update('users', id, updates);
  db.log('update', 'user', id, `更新用户 ${row.username}`);
  res.json({ success: true, message: '更新成功' });
});

/** DELETE /api/users/:id — 删除用户（软删除） */
router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.queryOne('users', id);
  if (!row) return res.status(404).json({ success: false, error: '用户不存在' });
  if (row.role === 'admin') {
    // 检查是否最后一个管理员
    const admins = db.getDB().exec('SELECT COUNT(*) as cnt FROM users WHERE role = ? AND is_deleted = 0', ['admin']);
    const adminCnt = admins.length > 0 ? Number(admins[0].values[0][0]) : 0;
    if (adminCnt <= 1) {
      return res.status(400).json({ success: false, error: '不能删除最后一个管理员' });
    }
  }

  db.softDelete('users', id);
  db.log('delete', 'user', id, `删除用户 ${row.username}`);
  res.json({ success: true, message: '已删除' });
});

export default router;
