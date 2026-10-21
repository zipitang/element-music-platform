/**
 *  系统 API — 统计 / 设置 / 活动日志 / 全局搜索
 */
import { Router } from 'express';
import db from '../db/index.js';

export const router = Router();

// GET /api/system/stats — 平台统计
router.get('/stats', (req, res) => {
  const stats = db.stats();
  const recentActivity = db.getActivity(20);
  const instruments = db.query('instrument_categories') as any[];
  const categoryStats = instruments.map(cat => ({
    ...cat,
    count: db.count('instruments', 'category_id = ? AND is_deleted = 0', [cat.id]),
  }));
  res.json({ success: true, data: { ...stats, recent_activity: recentActivity, category_stats: categoryStats } });
});

// GET /api/system/settings — 获取所有设置
router.get('/settings', (req, res) => {
  const items = db.query('app_settings');
  const settings: Record<string, any> = {};
  for (const item of items) {
    try { settings[(item as any).key] = JSON.parse((item as any).value_json); }
    catch { settings[(item as any).key] = (item as any).value_json; }
  }
  res.json({ success: true, data: settings });
});

// PUT /api/system/settings/:key — 更新设置
router.put('/settings/:key', (req, res) => {
  const { key } = req.params;
  const value = req.body;
  const database = db.getDB();
  const exists = database.prepare('SELECT id FROM app_settings WHERE key = ?').get(key);
  if (exists) {
    database.prepare('UPDATE app_settings SET value_json = ?, updated_at = datetime("now") WHERE key = ?').run(JSON.stringify(value), key);
  } else {
    database.prepare('INSERT INTO app_settings (key, value_json) VALUES (?, ?)').run(key, JSON.stringify(value));
  }
  res.json({ success: true, message: '设置已保存' });
});

// GET /api/system/activity — 活动日志
router.get('/activity', (req, res) => {
  const { limit = 50, target_type } = req.query;
  const conditions: string[] = [];
  const params: any[] = [];
  if (target_type) { conditions.push('target_type = ?'); params.push(target_type); }
  const where = conditions.length ? conditions.join(' AND ') : '1=1';
  const items = db.query('activity_log', { where, params, orderBy: 'created_at DESC', limit: Number(limit) });
  res.json({ success: true, data: items });
});

// GET /api/system/search?q=keyword — 全局搜索
router.get('/search', (req, res) => {
  const { q, scope = 'all' } = req.query;
  if (!q) return res.status(400).json({ success: false, error: '需要搜索关键词' });

  const results: Record<string, any[]> = {};

  if (scope === 'all' || scope === 'instruments') {
    results.instruments = db.search('instruments_fts', q as string, 20);
  }
  if (scope === 'all' || scope === 'projects') {
    results.projects = db.search('projects_fts', q as string, 20);
  }

  // 标签搜索
  if (scope === 'all' || scope === 'tags') {
    results.tags = db.query('tags', { where: 'name LIKE ?', params: [`%${q}%`] });
  }

  // 模板搜索
  if (scope === 'all' || scope === 'templates') {
    results.templates = db.query('templates', { where: '(name LIKE ? OR description LIKE ?) AND is_deleted = 0', params: [`%${q}%`, `%${q}%`] });
  }

  res.json({ success: true, data: results });
});

// GET /api/system/elements — 五行元素配置
router.get('/elements', (req, res) => {
  const elements = db.query('elements', { where: '1=1', orderBy: 'sort_order ASC' });
  res.json({ success: true, data: elements });
});

// GET /api/system/categories — 乐器分类
router.get('/categories', (req, res) => {
  const categories = db.query('instrument_categories', { where: '1=1', orderBy: 'sort_order ASC' });
  res.json({ success: true, data: categories });
});

// GET /api/system/tags — 所有标签
router.get('/tags', (req, res) => {
  const { category } = req.query;
  const where = category ? `category = '${category}'` : '1=1';
  const tags = db.query('tags', { where });
  res.json({ success: true, data: tags });
});

// POST /api/system/tags — 创建标签
router.post('/tags', (req, res) => {
  const { name, color, category } = req.body;
  if (!name) return res.status(400).json({ success: false, error: '需要标签名称' });
  const id = db.insert('tags', { name, color: color || '#ffffff', category: category || 'general' });
  res.json({ success: true, data: { id } });
});

// DELETE /api/system/tags/:id — 删除标签
router.delete('/tags/:id', (req, res) => {
  db.hardDelete('tags', Number(req.params.id));
  res.json({ success: true, message: '标签已删除' });
});
