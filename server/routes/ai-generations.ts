/**
 * ============================================================
 *  AI 创作记录 API — 查询/重命名/删除/下载
 * ============================================================
 */
import { Router } from 'express';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, renameSync, unlinkSync } from 'fs';
import db from '../db/index.js';

export const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_SONGS = resolve(__dirname, '../public/uploads/songs');

// ==================== 列表查询 ====================

/** GET /api/ai-generations — 创作记录列表 (支持搜索、分页) */
router.get('/', (req, res) => {
  const q = (req.query.q as string) || '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const status = (req.query.status as string) || '';

  let where = '1=1';
  const params: any[] = [];

  if (status) { where += ' AND status = ?'; params.push(status); }
  if (q) { where += ' AND title LIKE ?'; params.push(`%${q}%`); }

  const total = db.count('ai_generations', where, params);
  const rows = db.query('ai_generations', { where, params, orderBy: 'created_at DESC', limit, offset });

  res.json({ success: true, data: { items: rows, total, page, limit } });
});

// ==================== 单条详情 ====================

/** GET /api/ai-generations/:id */
router.get('/:id', (req, res) => {
  const row = db.queryOne('ai_generations', Number(req.params.id));
  if (!row) return res.status(404).json({ success: false, error: '记录不存在' });
  res.json({ success: true, data: row });
});

// ==================== 创建 (由 AI 生成流程自动调用) ====================

/** POST /api/ai-generations */
router.post('/', (req, res) => {
  const { title, file_path, file_size, duration, model, style, prompt, lyrics, status, mureka_task, metadata } = req.body;
  const id = db.insert('ai_generations', {
    title: title || 'Untitled',
    file_path: file_path || '',
    file_size: file_size || 0,
    duration: duration || 0,
    model: model || '',
    style: style || '',
    prompt: prompt || '',
    lyrics: lyrics || '',
    status: status || 'completed',
    mureka_task: mureka_task ? JSON.stringify(mureka_task) : '',
    metadata: metadata ? JSON.stringify(metadata) : '{}',
  });
  db.log('create', 'ai_generation', id, `AI创作: ${title || 'Untitled'}`);
  res.json({ success: true, data: { id, title, file_path, file_size } });
});

// ==================== 重命名 ====================

/** PATCH /api/ai-generations/:id/rename */
router.patch('/:id/rename', (req, res) => {
  const id = Number(req.params.id);
  const { title } = req.body;
  if (!title?.trim()) return res.status(400).json({ success: false, error: '名称不能为空' });

  const row = db.queryOne('ai_generations', id);
  if (!row) return res.status(404).json({ success: false, error: '记录不存在' });

  const safe = title.replace(/[<>:"/\\|?*]/g, '_');
  const oldPath = row.file_path;

  // 重命名文件
  if (oldPath) {
    const oldFull = resolve(UPLOADS_SONGS, oldPath.replace('/uploads/songs/', ''));
    if (existsSync(oldFull)) {
      const ext = oldPath.split('.').pop() || 'mp3';
      const newName = `${safe}_${id}.${ext}`;
      const newFull = resolve(UPLOADS_SONGS, newName);
      try { renameSync(oldFull, newFull); } catch (e: any) { console.warn('[RENAME]', e.message); }
      db.update('ai_generations', id, { title: safe, file_path: `/uploads/songs/${newName}`, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) });
    } else {
      db.update('ai_generations', id, { title: safe });
    }
  } else {
    db.update('ai_generations', id, { title: safe });
  }

  db.log('update', 'ai_generation', id, `重命名: ${safe}`);
  res.json({ success: true, data: { id, title: safe } });
});

// ==================== 删除 ====================

/** DELETE /api/ai-generations/:id */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.queryOne('ai_generations', id);
  if (!row) return res.status(404).json({ success: false, error: '记录不存在' });

  // 删除文件
  if (row.file_path) {
    const fullPath = resolve(UPLOADS_SONGS, row.file_path.replace('/uploads/songs/', ''));
    try { if (existsSync(fullPath)) unlinkSync(fullPath); } catch (e: any) { console.warn('[DEL]', e.message); }
  }

  db.hardDelete('ai_generations', id);
  db.log('delete', 'ai_generation', id, `删除: ${row.title}`);
  res.json({ success: true, message: '已删除' });
});

// ==================== 下载 ====================

/** GET /api/ai-generations/:id/download */
router.get('/:id/download', (req, res) => {
  const id = Number(req.params.id);
  const row = db.queryOne('ai_generations', id);
  if (!row || !row.file_path) return res.status(404).json({ success: false, error: '文件不存在' });

  const filename = row.file_path.replace('/uploads/songs/', '');
  const fullPath = resolve(UPLOADS_SONGS, filename);
  if (!existsSync(fullPath)) return res.status(404).json({ success: false, error: '文件丢失' });

  res.download(fullPath, `${row.title}.${filename.split('.').pop() || 'mp3'}`);
});

export default router;
