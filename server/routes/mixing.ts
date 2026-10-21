/**
 *  混音 API（火）— 预设管理 + 快照保存/恢复
 */
import { Router } from 'express';
import db from '../db/index.js';

export const router = Router();

// GET /api/mixing/presets — 混音预设列表
router.get('/presets', (req, res) => {
  const { category, element_id } = req.query;
  const conditions: string[] = ['is_deleted = 0'];
  const params: any[] = [];
  if (category) { conditions.push('category = ?'); params.push(category); }
  if (element_id) { conditions.push('element_id = ?'); params.push(element_id); }
  const presets = db.query('mix_presets', { where: conditions.join(' AND '), params, orderBy: 'created_at DESC' });
  res.json({ success: true, data: presets });
});

// GET /api/mixing/presets/:id — 预设详情
router.get('/presets/:id', (req, res) => {
  const preset = db.queryOne('mix_presets', Number(req.params.id));
  if (!preset) return res.status(404).json({ success: false, error: '预设不存在' });
  res.json({ success: true, data: preset });
});

// POST /api/mixing/presets — 创建预设
router.post('/presets', (req, res) => {
  const { name, description, category, config_json, element_id } = req.body;
  if (!name || !config_json) return res.status(400).json({ success: false, error: '需要名称和配置' });
  const id = db.insert('mix_presets', { name, description, category: category || 'custom', config_json: JSON.stringify(config_json), element_id, is_builtin: 0 });
  db.log('create', 'mix_preset', id, `创建混音预设: ${name}`);
  res.json({ success: true, data: { id } });
});

// PUT /api/mixing/presets/:id — 更新预设
router.put('/presets/:id', (req, res) => {
  if (req.body.config_json) req.body.config_json = JSON.stringify(req.body.config_json);
  db.update('mix_presets', Number(req.params.id), req.body);
  res.json({ success: true, message: '预设更新成功' });
});

// DELETE /api/mixing/presets/:id — 删除预设
router.delete('/presets/:id', (req, res) => {
  db.softDelete('mix_presets', Number(req.params.id));
  res.json({ success: true, message: '预设删除成功' });
});

// ==================== 混音快照 ====================

// GET /api/mixing/snapshots?project_id=1 — 获取工程的混音快照
router.get('/snapshots', (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ success: false, error: '需要project_id' });
  const snapshots = db.query('mix_snapshots', {
    where: 'project_id = ? AND is_deleted = 0',
    params: [project_id],
    orderBy: 'created_at DESC'
  });
  res.json({ success: true, data: snapshots });
});

// POST /api/mixing/snapshots — 保存快照
router.post('/snapshots', (req, res) => {
  const { project_id, name, config_json, description } = req.body;
  if (!project_id || !config_json) return res.status(400).json({ success: false, error: '需要project_id和配置' });
  const id = db.insert('mix_snapshots', { project_id, name: name || `快照 ${new Date().toLocaleString('zh-CN')}`, config_json: JSON.stringify(config_json), description });
  db.log('create', 'mix_snapshot', id, `保存混音快照: ${name}`);
  res.json({ success: true, data: { id } });
});

// DELETE /api/mixing/snapshots/:id — 删除快照
router.delete('/snapshots/:id', (req, res) => {
  db.softDelete('mix_snapshots', Number(req.params.id));
  res.json({ success: true, message: '快照删除成功' });
});
