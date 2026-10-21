/**
 *  编曲工程 API（木）— 文件夹树 + 工程CRUD + 附件封装
 */
import { Router } from 'express';
import db from '../db/index.js';

export const router = Router();

// ==================== 工程文件夹（目录树） ====================

// GET /api/projects/folders — 获取目录树
router.get('/folders', (req, res) => {
  const all = db.query('project_folders', { orderBy: 'sort_order ASC, id ASC' }) as any[];
  const tree = buildTree(all);
  res.json({ success: true, data: tree });
});

function buildTree(items: any[], parentId = 0): any[] {
  return items
    .filter(f => f.parent_id === parentId && f.is_deleted === 0)
    .map(f => ({
      ...f,
      children: buildTree(items, f.id),
      // 查询该文件夹下的工程数
      project_count: 0, // 后续填充
    }));
}

// POST /api/projects/folders — 创建文件夹
router.post('/folders', (req, res) => {
  const data = { ...req.body, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) };
  const id = db.insert('project_folders', data);
  db.log('create', 'folder', id, `创建文件夹: ${data.name}`);
  res.json({ success: true, data: { id } });
});

// PUT /api/projects/folders/:id — 更新文件夹
router.put('/folders/:id', (req, res) => {
  db.update('project_folders', Number(req.params.id), req.body);
  res.json({ success: true, message: '文件夹更新成功' });
});

// DELETE /api/projects/folders/:id — 删除文件夹（含子文件夹和工程）
router.delete('/folders/:id', (req, res) => {
  const id = Number(req.params.id);
  // 递归软删除子文件夹
  const allFolders = db.query('project_folders') as any[];
  const childIds = getDescendantIds(allFolders, id);
  for (const fid of [...childIds, id]) {
    db.softDelete('project_folders', fid);
  }
  db.log('delete', 'folder', id, `删除文件夹及其${childIds.length}个子文件夹`);
  res.json({ success: true, message: '删除成功' });
});

function getDescendantIds(all: any[], parentId: number): number[] {
  const ids: number[] = [];
  for (const f of all) {
    if (f.parent_id === parentId) {
      ids.push(f.id);
      ids.push(...getDescendantIds(all, f.id));
    }
  }
  return ids;
}

// ==================== 编曲工程 CRUD ====================

// GET /api/projects — 工程列表（支持过滤）
router.get('/', (req, res) => {
  const { folder_id, status, genre, element_id, search, sort = 'updated_at', order = 'DESC', page = 1, limit = 20 } = req.query;
  const conditions: string[] = ['is_deleted = 0'];
  const params: any[] = [];

  if (folder_id) { conditions.push('folder_id = ?'); params.push(folder_id); }
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (genre) { conditions.push('genre = ?'); params.push(genre); }
  if (element_id) { conditions.push('element_id = ?'); params.push(element_id); }
  if (search) { conditions.push('(name LIKE ? OR description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const offset = (Number(page) - 1) * Number(limit);
  const items = db.query('projects', { where: conditions.join(' AND '), params, orderBy: `${sort} ${order}`, limit: Number(limit), offset });
  const total = db.count('projects', conditions.join(' AND '), params);

  // 附加轨道数
  const database = db.getDB();
  const itemsWithTrackCount = items.map((item: any) => {
    const trackCount = (database.prepare('SELECT COUNT(*) as c FROM tracks WHERE project_id = ? AND is_deleted = 0').get(item.id) as any).c;
    return { ...item, track_count: trackCount };
  });

  res.json({ success: true, data: itemsWithTrackCount, total, page: Number(page), limit: Number(limit) });
});

// GET /api/projects/:id — 工程详情（含轨道和附件）
router.get('/:id', (req, res) => {
  const project = db.queryOne('projects', Number(req.params.id));
  if (!project) return res.status(404).json({ success: false, error: '工程不存在' });

  const tracks = db.query('tracks', { where: 'project_id = ? AND is_deleted = 0', params: [project.id], orderBy: 'sort_order ASC' });
  const clips = db.query('track_clips', {
    where: `track_id IN (${tracks.map((t: any) => t.id).join(',')}) AND is_deleted = 0`,
    orderBy: 'start_time ASC'
  });
  const attachments = db.query('project_attachments', { where: 'project_id = ? AND is_deleted = 0', params: [project.id] });
  const copyright = db.query('copyrights', { where: 'project_id = ? AND is_deleted = 0', params: [project.id] });

  res.json({ success: true, data: { ...project, tracks, clips, attachments, copyrights: copyright } });
});

// POST /api/projects — 创建工程
router.post('/', (req, res) => {
  const data = { ...req.body, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) };
  const id = db.insert('projects', data);
  db.log('create', 'project', id, `创建工程: ${data.name}`);

  // 如果有关联模板，记录模板使用
  if (data.template_id) {
    const tpl = db.queryOne('templates', Number(data.template_id));
    if (tpl) db.update('templates', tpl.id, { usage_count: ((tpl as any).usage_count || 0) + 1 } as any);
  }

  res.json({ success: true, data: { id }, message: '工程创建成功' });
});

// PUT /api/projects/:id — 更新工程
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const exists = db.queryOne('projects', id);
  if (!exists) return res.status(404).json({ success: false, error: '工程不存在' });
  db.update('projects', id, req.body);
  db.log('update', 'project', id, `更新工程: ${(exists as any).name}`);
  res.json({ success: true, message: '更新成功' });
});

// PATCH /api/projects/:id/status — 更新状态
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  db.update('projects', Number(req.params.id), { status });
  res.json({ success: true, message: '状态更新成功' });
});

// DELETE /api/projects/:id — 软删除
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.softDelete('projects', id);
  // 同时删除关联轨道
  const tracks = db.query('tracks', { where: 'project_id = ?', params: [id] }) as any[];
  for (const t of tracks) db.softDelete('tracks', t.id);
  db.log('delete', 'project', id, `删除工程及${tracks.length}个轨道`);
  res.json({ success: true, message: '删除成功' });
});

// POST /api/projects/:id/duplicate — 复制工程
router.post('/:id/duplicate', (req, res) => {
  const original = db.queryOne('projects', Number(req.params.id));
  if (!original) return res.status(404).json({ success: false, error: '工程不存在' });
  const copyData = { ...original };
  delete (copyData as any).id;
  (copyData as any).name = `${(original as any).name} (副本)`;
  (copyData as any).status = 'draft';
  const newId = db.insert('projects', copyData as Record<string, any>);
  db.log('create', 'project', newId, `复制工程: ${(copyData as any).name}`);
  res.json({ success: true, data: { id: newId } });
});

// GET /api/projects/recent — 最近工程
router.get('/list/recent', (req, res) => {
  const items = db.query('projects', { where: 'is_deleted = 0', orderBy: 'updated_at DESC', limit: 10 });
  res.json({ success: true, data: items });
});
