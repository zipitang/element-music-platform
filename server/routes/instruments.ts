/**
 *  音源素材库 API（金）— CRUD + 搜索 + 分类 + 收藏 + 评分
 */
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { existsSync, unlinkSync, statSync, createReadStream } from 'fs';
import { resolve, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import db from '../db/index.js';

export const router = Router();

// 文件上传配置
const __dirname = dirname(fileURLToPath(import.meta.url));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = resolve(__dirname, '../public/uploads/instruments');
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname) || '.mp3';
    cb(null, `${randomUUID()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },  // 500MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.mp3', '.wav', '.flac', '.ogg', '.mid', '.midi'];
    const ext = extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// ---- GET /api/instruments ---- 列表（支持过滤/排序/分页/搜索）
router.get('/', (req, res) => {
  const { category_id, element_id, format, is_favorite, is_builtin, search, sort, order = 'DESC', page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const conditions: string[] = ['is_deleted = 0'];
  const params: any[] = [];

  if (category_id) { conditions.push('category_id = ?'); params.push(category_id); }
  if (element_id) { conditions.push('element_id = ?'); params.push(element_id); }
  if (format) { conditions.push('format = ?'); params.push(format); }
  if (is_favorite === '1') { conditions.push('is_favorite = 1'); }
  if (is_builtin === '1') { conditions.push('is_builtin = 1'); }
  if (search) { conditions.push('(name LIKE ? OR description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  const orderBy = sort ? `${sort} ${order}` : 'created_at DESC';
  const where = conditions.join(' AND ');

  const items = db.query('instruments', { where, params, orderBy, limit: Number(limit), offset });
  const total = db.count('instruments', where, params);

  // 附加分类名称
  const categories = db.query('instrument_categories') as any[];
  const itemsWithCategory = items.map((item: any) => {
    const cat = categories.find(c => c.id === item.category_id);
    return { ...item, category_name: cat?.name || '' };
  });

  res.json({ success: true, data: itemsWithCategory, total, page: Number(page), limit: Number(limit) });
});

// ---- GET /api/instruments/:id ---- 详情
router.get('/:id', (req, res) => {
  const item = db.queryOne('instruments', Number(req.params.id));
  if (!item) return res.status(404).json({ success: false, error: '音源不存在' });
  // 附带附件列表
  const attachments = db.query('instrument_attachments', {
    where: 'instrument_id = ? AND is_deleted = 0',
    params: [item.id]
  });
  res.json({ success: true, data: { ...item, attachments } });
});

// ---- POST /api/instruments ---- 创建
router.post('/', (req, res) => {
  const data = { ...req.body, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) };
  const id = db.insert('instruments', data);
  db.log('create', 'instrument', id, `创建音源: ${data.name}`);
  res.json({ success: true, data: { id }, message: '音源创建成功' });
});

// ---- PUT /api/instruments/:id ---- 更新
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const exists = db.queryOne('instruments', id);
  if (!exists) return res.status(404).json({ success: false, error: '音源不存在' });
  db.update('instruments', id, req.body);
  db.log('update', 'instrument', id, `更新音源: ${exists.name}`);
  res.json({ success: true, message: '更新成功' });
});

// ---- DELETE /api/instruments/:id ---- 软删除
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const exists = db.queryOne('instruments', id);
  if (!exists) return res.status(404).json({ success: false, error: '音源不存在' });
  db.softDelete('instruments', id);
  db.log('delete', 'instrument', id, `删除音源: ${exists.name}`);
  res.json({ success: true, message: '删除成功' });
});

// ---- POST /api/instruments/:id/favorite ---- 收藏/取消
router.post('/:id/favorite', (req, res) => {
  const id = Number(req.params.id);
  const current = db.queryOne('instruments', id);
  if (!current) return res.status(404).json({ success: false, error: '音源不存在' });
  db.update('instruments', id, { is_favorite: current.is_favorite ? 0 : 1 } as any);
  res.json({ success: true, data: { is_favorite: current.is_favorite ? 0 : 1 } });
});

// ---- POST /api/instruments/:id/rate ---- 评分
router.post('/:id/rate', (req, res) => {
  const id = Number(req.params.id);
  const { rating } = req.body;
  if (rating < 0 || rating > 5) return res.status(400).json({ success: false, error: '评分需在0-5之间' });
  db.update('instruments', id, { rating });
  res.json({ success: true, message: '评分成功' });
});

// ---- POST /api/instruments/:id/play ---- 播放计数
router.post('/:id/play', (req, res) => {
  const id = Number(req.params.id);
  const current = db.queryOne('instruments', id);
  if (!current) return res.status(404).json({ success: false, error: '音源不存在' });
  db.update('instruments', id, { play_count: (current.play_count || 0) + 1 } as any);
  res.json({ success: true });
});

// ---- POST /api/instruments/upload ---- 上传音源文件
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: '未选择文件' });

  const file = req.file;
  const hash = createHash('md5').update(createReadStream(file.path)).digest('hex');
  const ext = extname(file.originalname).replace('.', '');

  // 创建音源记录
  const meta = req.body;
  const id = db.insert('instruments', {
    name: meta.name || basename(file.originalname, extname(file.originalname)),
    category_id: Number(meta.category_id) || 1,
    element_id: Number(meta.element_id) || 1,
    description: meta.description || '',
    file_path: `/uploads/instruments/${file.filename}`,
    file_hash: hash,
    file_size: file.size,
    format: ext,
    tags_json: meta.tags_json || '[]',
    metadata_json: meta.metadata_json || '{}',
    is_builtin: 0,
  });
  db.log('create', 'instrument', id, `上传音源文件: ${file.originalname}`);

  res.json({ success: true, data: { id, file_path: `/uploads/instruments/${file.filename}`, file_hash: hash, file_size: file.size } });
});

// ---- 批量操作 ----
router.post('/batch/delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ success: false, error: 'ids必须是数组' });
  const database = db.getDB();
  database.transaction(() => {
    for (const id of ids) db.softDelete('instruments', id);
  })();
  db.log('batch_delete', 'instrument', 0, `批量删除${ids.length}个音源`);
  res.json({ success: true, message: `已删除${ids.length}个音源` });
});

// ---- 分类列表 ----
router.get('/categories/list', (req, res) => {
  const items = db.query('instrument_categories');
  res.json({ success: true, data: items });
});
