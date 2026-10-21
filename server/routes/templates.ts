/**
 *  模板 API — 24节气 + 戏曲流派模板 CRUD
 */
import { Router } from 'express';
import db from '../db/index.js';

export const router = Router();

// GET /api/templates — 模板列表（支持类型过滤）
router.get('/', (req, res) => {
  const { type, subtype, genre, element_id, search, page = 1, limit = 24 } = req.query;
  const conditions: string[] = ['is_deleted = 0'];
  const params: any[] = [];
  if (type) { conditions.push('type = ?'); params.push(type); }
  if (subtype) { conditions.push('subtype = ?'); params.push(subtype); }
  if (genre) { conditions.push('genre = ?'); params.push(genre); }
  if (element_id) { conditions.push('element_id = ?'); params.push(element_id); }
  if (search) { conditions.push('(name LIKE ? OR description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const offset = (Number(page) - 1) * Number(limit);
  const items = db.query('templates', { where: conditions.join(' AND '), params, orderBy: 'id ASC', limit: Number(limit), offset });
  const total = db.count('templates', conditions.join(' AND '), params);
  res.json({ success: true, data: items, total, page: Number(page), limit: Number(limit) });
});

// GET /api/templates/:id — 模板详情
router.get('/:id', (req, res) => {
  const item = db.queryOne('templates', Number(req.params.id));
  if (!item) return res.status(404).json({ success: false, error: '模板不存在' });
  // 解析 config_json
  const data = { ...item, config: JSON.parse((item as any).config_json || '{}') };
  res.json({ success: true, data });
});

// POST /api/templates — 创建模板
router.post('/', (req, res) => {
  const data = { ...req.body, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) };
  if (data.config_json && typeof data.config_json === 'object') data.config_json = JSON.stringify(data.config_json);
  const id = db.insert('templates', data);
  db.log('create', 'template', id, `创建模板: ${data.name}`);
  res.json({ success: true, data: { id } });
});

// PUT /api/templates/:id — 更新模板
router.put('/:id', (req, res) => {
  if (req.body.config_json && typeof req.body.config_json === 'object') req.body.config_json = JSON.stringify(req.body.config_json);
  db.update('templates', Number(req.params.id), req.body);
  res.json({ success: true, message: '模板更新成功' });
});

// DELETE /api/templates/:id — 删除模板
router.delete('/:id', (req, res) => {
  db.softDelete('templates', Number(req.params.id));
  res.json({ success: true, message: '模板删除成功' });
});

// POST /api/templates/:id/use — 使用模板（增加计数）
router.post('/:id/use', (req, res) => {
  const tpl = db.queryOne('templates', Number(req.params.id));
  if (!tpl) return res.status(404).json({ success: false, error: '模板不存在' });
  db.update('templates', (tpl as any).id, { usage_count: ((tpl as any).usage_count || 0) + 1 } as any);
  res.json({ success: true, data: tpl });
});

// GET /api/templates/types — 获取所有模板类型
router.get('/list/types', (req, res) => {
  const types = [
    { value: 'solar_term', label: '二十四节气', icon: 'calendar' },
    { value: 'genre', label: '戏曲流派', icon: 'theater' },
    { value: 'mood', label: '情绪意境', icon: 'mood' },
    { value: 'era', label: '朝代风格', icon: 'dynasty' },
  ];
  const subtypes = {
    solar_term: ['立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至','小寒','大寒'],
    genre: ['京剧','昆曲','粤剧','古风','流行','爵士','摇滚'],
  };
  res.json({ success: true, data: { types, subtypes } });
});
