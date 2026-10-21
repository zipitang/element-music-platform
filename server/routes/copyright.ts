/**
 *  版权软著 API（土）— 版权管理 + 证书生成
 */
import { Router } from 'express';
import db from '../db/index.js';

export const router = Router();

// GET /api/copyright — 版权列表
router.get('/', (req, res) => {
  const { status, project_id, search, page = 1, limit = 20 } = req.query;
  const conditions: string[] = ['is_deleted = 0'];
  const params: any[] = [];
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (project_id) { conditions.push('project_id = ?'); params.push(project_id); }
  if (search) { conditions.push('(title LIKE ? OR author LIKE ? OR registration_no LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const offset = (Number(page) - 1) * Number(limit);
  const items = db.query('copyrights', { where: conditions.join(' AND '), params, orderBy: 'created_at DESC', limit: Number(limit), offset });
  const total = db.count('copyrights', conditions.join(' AND '), params);
  res.json({ success: true, data: items, total, page: Number(page), limit: Number(limit) });
});

// GET /api/copyright/:id — 版权详情
router.get('/:id', (req, res) => {
  const item = db.queryOne('copyrights', Number(req.params.id));
  if (!item) return res.status(404).json({ success: false, error: '版权记录不存在' });
  res.json({ success: true, data: item });
});

// POST /api/copyright — 创建版权记录
router.post('/', (req, res) => {
  const data = { ...req.body, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) };
  const id = db.insert('copyrights', data);
  db.log('create', 'copyright', id, `创建版权记录: ${data.title}`);
  res.json({ success: true, data: { id }, message: '版权记录创建成功' });
});

// PUT /api/copyright/:id — 更新版权
router.put('/:id', (req, res) => {
  db.update('copyrights', Number(req.params.id), req.body);
  res.json({ success: true, message: '版权更新成功' });
});

// PATCH /api/copyright/:id/status — 更新状态（提交/审批/认证）
router.patch('/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const { status, registration_no } = req.body;
  const updates: Record<string, any> = { status };
  if (registration_no) updates.registration_no = registration_no;
  if (status === 'submitted') updates.submit_time = new Date().toISOString();
  if (status === 'approved' || status === 'certified') updates.approve_time = new Date().toISOString();
  db.update('copyrights', id, updates);
  db.log('update', 'copyright', id, `版权状态更新: ${status}`);
  res.json({ success: true, message: `状态已更新为: ${status}` });
});

// DELETE /api/copyright/:id — 删除
router.delete('/:id', (req, res) => {
  db.softDelete('copyrights', Number(req.params.id));
  res.json({ success: true, message: '删除成功' });
});

// GET /api/copyright/:id/certificate — 生成证书数据
router.get('/:id/certificate', (req, res) => {
  const item = db.queryOne('copyrights', Number(req.params.id));
  if (!item) return res.status(404).json({ success: false, error: '版权记录不存在' });

  const project = item.project_id ? db.queryOne('projects', item.project_id) : null;
  res.json({
    success: true,
    data: {
      ...item,
      project_name: (project as any)?.name || '',
      certificate_html: generateCertificateHTML(item, project),
    }
  });
});

function generateCertificateHTML(copyright: any, project: any): string {
  return `
    <div style="font-family:'Ma Shan Zheng',serif;padding:40px;background:#faf3e0;border:3px double #8b6b4a;">
      <div style="text-align:center;margin-bottom:30px;">
        <h1 style="font-size:36px;color:#8b6b4a;">元素音乐编曲管理平台</h1>
        <h2 style="font-size:24px;color:#c9a84c;">作品版权登记证书</h2>
      </div>
      <div style="border:1px solid #8b6b4a;padding:30px;margin:20px 0;">
        <p>作品名称：${copyright.title}</p>
        <p>著作权人：${copyright.author}</p>
        <p>作品类型：${copyright.work_type}</p>
        ${copyright.registration_no ? `<p>登记号：${copyright.registration_no}</p>` : ''}
        ${project ? `<p>关联工程：${project.name}</p>` : ''}
        <p>登记日期：${new Date(copyright.created_at).toLocaleDateString('zh-CN')}</p>
      </div>
      <div style="text-align:right;margin-top:40px;">
        <p style="color:#8b6b4a;">—— 元素音乐编曲管理平台 ——</p>
      </div>
    </div>
  `;
}
