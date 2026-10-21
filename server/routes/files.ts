/**
 *  文件管理 API — 统一上传/下载/打包封装
 *  支持音源文件、封面、歌词、CSS演示、配置元数据等
 */
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { resolve, basename, extname, dirname } from 'path';
import { createReadStream, existsSync, unlinkSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';;

import { createHash } from 'crypto';
import db from '../db/index.js';

export const router = Router();

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_BASE = resolve(__dirname, '../public/uploads');

// 通用上传存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.type || 'general';
    const dir = resolve(UPLOAD_BASE, type);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname) || '.bin';
    cb(null, `${randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

// POST /api/files/upload — 通用文件上传
// body: { type: 'covers'|'lyrics'|'css'|'instruments'|'projects'|..., target_type: 'instrument'|'project'|'copyright', target_id: number }
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: '未选择文件' });

  const file = req.file;
  const type = req.body.type || 'general';
  const hash = createHash('md5').update(createReadStream(file.path)).digest('hex');
  const relativePath = `/uploads/${type}/${file.filename}`;

  const fileInfo = {
    file_name: file.originalname,
    file_path: relativePath,
    file_size: file.size,
    file_hash: hash,
    mime_type: file.mimetype,
  };

  // 如果有关联目标，创建附件记录
  const { target_type, target_id } = req.body;
  if (target_type && target_id) {
    let attachTable = '';
    if (target_type === 'instrument') attachTable = 'instrument_attachments';
    else if (target_type === 'project') attachTable = 'project_attachments';
    if (attachTable) {
      const idField = `${target_type}_id`;
      db.insert(attachTable, {
        [idField]: Number(target_id),
        file_type: extname(file.originalname).replace('.', ''),
        file_name: file.originalname,
        file_path: relativePath,
        file_size: file.size,
        file_hash: hash,
        mime_type: file.mimetype,
      });
    }
  }

  db.log('create', 'file', 0, `上传文件: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
  res.json({ success: true, data: fileInfo });
});

// POST /api/files/upload/batch — 批量上传
router.post('/upload/batch', upload.array('files', 20), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ success: false, error: '未选择文件' });

  const results = req.files.map(file => {
    const hash = createHash('md5').update(createReadStream(file.path)).digest('hex');
    const type = (req.body as any).type || 'general';
    return {
      file_name: file.originalname,
      file_path: `/uploads/${type}/${file.filename}`,
      file_size: file.size,
      file_hash: hash,
    };
  });

  db.log('create', 'file', 0, `批量上传${results.length}个文件`);
  res.json({ success: true, data: results, count: results.length });
});

// GET /api/files/download/:path — 文件下载
router.get('/download/*', (req, res) => {
  const filePath = decodeURIComponent(req.params[0]);
  const fullPath = resolve(UPLOAD_BASE, '..', filePath);

  if (!existsSync(fullPath)) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }

  res.download(fullPath, basename(fullPath));
});

// DELETE /api/files — 删除文件
router.delete('/', (req, res) => {
  const { file_path } = req.body;
  if (!file_path) return res.status(400).json({ success: false, error: '需要file_path' });

  const fullPath = resolve(UPLOAD_BASE, '..', file_path);
  try {
    
    if (existsSync(fullPath)) unlinkSync(fullPath);
  } catch (e: any) {
    console.warn(`[FILE] 删除文件失败: ${e.message}`);
  }

  db.log('delete', 'file', 0, `删除文件: ${file_path}`);
  res.json({ success: true, message: '文件已删除' });
});

// GET /api/files/list?type=instruments — 列出目录下的文件
router.get('/list', (req, res) => {
  const { type } = req.query;
  const dir = resolve(UPLOAD_BASE, type as string);
  try {
    const { readdirSync, statSync } = require('fs');
    const files = readdirSync(dir).map(name => {
      const stat = statSync(resolve(dir, name));
      return { name, size: stat.size, modified: stat.mtime };
    });
    res.json({ success: true, data: files });
  } catch {
    res.json({ success: true, data: [] });
  }
});
