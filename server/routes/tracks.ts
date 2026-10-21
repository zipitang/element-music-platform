/**
 *  轨道 API（水）— 轨道CRUD + 片段管理 + 音频数据操作
 */
import { Router } from 'express';
import db from '../db/index.js';

export const router = Router();

// GET /api/tracks?project_id=1 — 获取工程的所有轨道
router.get('/', (req, res) => {
  const { project_id } = req.query;
  if (!project_id) return res.status(400).json({ success: false, error: '需要project_id参数' });
  const tracks = db.query('tracks', {
    where: 'project_id = ? AND is_deleted = 0',
    params: [project_id],
    orderBy: 'sort_order ASC'
  });
  // 附加每个轨道的片段
  const database = db.getDB();
  const tracksWithClips = tracks.map((track: any) => {
    const clips = db.query('track_clips', {
      where: 'track_id = ? AND is_deleted = 0',
      params: [track.id],
      orderBy: 'start_time ASC'
    });
    return { ...track, clips };
  });
  res.json({ success: true, data: tracksWithClips });
});

// GET /api/tracks/:id — 轨道详情
router.get('/:id', (req, res) => {
  const track = db.queryOne('tracks', Number(req.params.id));
  if (!track) return res.status(404).json({ success: false, error: '轨道不存在' });
  const clips = db.query('track_clips', { where: 'track_id = ? AND is_deleted = 0', params: [track.id] });
  res.json({ success: true, data: { ...track, clips } });
});

// POST /api/tracks — 创建轨道
router.post('/', (req, res) => {
  const data = { ...req.body, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) };
  const id = db.insert('tracks', data);
  db.log('create', 'track', id, `创建轨道: ${data.name}`);
  res.json({ success: true, data: { id } });
});

// PUT /api/tracks/:id — 更新轨道（音量/声像/静音/独奏等）
router.put('/:id', (req, res) => {
  db.update('tracks', Number(req.params.id), req.body);
  res.json({ success: true, message: '轨道更新成功' });
});

// PATCH /api/tracks/reorder — 批量重排序
router.patch('/reorder', (req, res) => {
  const { orders } = req.body; // [{id, sort_order}]
  const database = db.getDB();
  database.transaction(() => {
    for (const item of orders) {
      database.prepare('UPDATE tracks SET sort_order = ? WHERE id = ?').run(item.sort_order, item.id);
    }
  })();
  res.json({ success: true, message: '排序更新成功' });
});

// DELETE /api/tracks/:id — 删除轨道（含片段）
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.softDelete('tracks', id);
  const clips = db.query('track_clips', { where: 'track_id = ?', params: [id] }) as any[];
  for (const c of clips) db.softDelete('track_clips', c.id);
  db.log('delete', 'track', id, `删除轨道及${clips.length}个片段`);
  res.json({ success: true, message: '删除成功' });
});

// ==================== 轨道片段 ====================

// POST /api/tracks/:trackId/clips — 添加片段
router.post('/:trackId/clips', (req, res) => {
  const data = { ...req.body, track_id: Number(req.params.trackId), created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) };
  const id = db.insert('track_clips', data);
  db.log('create', 'clip', id, `添加片段: ${data.name}`);
  res.json({ success: true, data: { id } });
});

// PUT /api/tracks/clips/:id — 更新片段（时间/增益/淡入淡出）
router.put('/clips/:id', (req, res) => {
  db.update('track_clips', Number(req.params.id), req.body);
  res.json({ success: true, message: '片段更新成功' });
});

// DELETE /api/tracks/clips/:id — 删除片段
router.delete('/clips/:id', (req, res) => {
  db.softDelete('track_clips', Number(req.params.id));
  res.json({ success: true, message: '片段删除成功' });
});

// POST /api/tracks/clips/:id/waveform — 更新波形数据
router.post('/clips/:id/waveform', (req, res) => {
  const { waveform_json } = req.body;
  db.update('track_clips', Number(req.params.id), { waveform_json });
  res.json({ success: true, message: '波形数据已更新' });
});

// POST /api/tracks/clips/:id/notes — 更新MIDI音符
router.post('/clips/:id/notes', (req, res) => {
  const { notes_json } = req.body;
  db.update('track_clips', Number(req.params.id), { notes_json: JSON.stringify(notes_json) });
  res.json({ success: true, message: 'MIDI音符已更新' });
});
