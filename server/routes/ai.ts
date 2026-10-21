/**
 * ============================================================
 *  Mureka AI 路由 v2.0 - 后端代理层
 *  支持: 歌词/歌曲/纯音乐/配乐/音色克隆/混音/编辑/TTS
 *  模型: mureka-7.6 | mureka-o2(O1) | mureka-8 | mureka-9
 * ============================================================
 */
import { Router } from 'express';
import multer from 'multer';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import axios from 'axios';
import * as mureka from '../services/mureka.js';

export const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ==================== 歌词生成 ====================

router.post('/lyrics/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ success: false, error: '提示词不能为空' });
    const result = await mureka.generateLyrics(prompt);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/lyrics/extend', async (req, res) => {
  try {
    const { lyrics } = req.body;
    if (!lyrics?.trim()) return res.status(400).json({ success: false, error: '歌词内容不能为空' });
    const result = await mureka.extendLyrics(lyrics);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 歌曲生成 ====================

/** POST /api/ai/song/generate */
router.post('/song/generate', async (req, res) => {
  try {
    const { lyrics, prompt, model, n, reference_id, vocal_id, melody_id, instrumental_id, stream } = req.body;
    if (!lyrics?.trim()) return res.status(400).json({ success: false, error: '歌词不能为空' });
    const result = await mureka.generateSong({
      lyrics, prompt, model, n,
      reference_id, vocal_id, melody_id, instrumental_id,
      stream,
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/song/extend', async (req, res) => {
  try {
    const { song_id, upload_audio_id, lyrics, extend_at } = req.body;
    if (!extend_at) return res.status(400).json({ success: false, error: 'extend_at不能为空' });
    if (!song_id && !upload_audio_id) return res.status(400).json({ success: false, error: 'song_id或upload_audio_id必须提供其一' });
    const result = await mureka.extendSong({ song_id, upload_audio_id, lyrics, extend_at });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/song/query/:taskId', async (req, res) => {
  try {
    const result = await mureka.querySongTask(req.params.taskId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/ai/song/poll - 轮询等待任务完成 */
router.post('/song/poll', async (req, res) => {
  try {
    const { taskId, intervalMs, timeoutMs } = req.body;
    if (!taskId) return res.status(400).json({ success: false, error: 'taskId不能为空' });
    const result = await mureka.pollTask(taskId, mureka.querySongTask, {
      intervalMs, timeoutMs,
      onProgress: (status) => console.log(`[Mureka] 轮询进度: ${taskId} -> ${status}`),
    });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 音色克隆 ====================

/** POST /api/ai/voice/clone */
router.post('/voice/clone', async (req, res) => {
  try {
    const { upload_audio_id, voice_name, description } = req.body;
    if (!upload_audio_id) return res.status(400).json({ success: false, error: 'upload_audio_id不能为空' });
    const result = await mureka.cloneVoice({ upload_audio_id, voice_name, description });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** GET /api/ai/voice/list */
router.get('/voice/list', async (_req, res) => {
  try {
    const result = await mureka.listVoices();
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 纯音乐生成 ====================

router.post('/instrumental/generate', async (req, res) => {
  try {
    const { prompt, instrumental_id, model, n } = req.body;
    if (!prompt?.trim() && !instrumental_id) return res.status(400).json({ success: false, error: 'prompt或instrumental_id必须提供其一' });
    const result = await mureka.generateInstrumental({ prompt, instrumental_id, model, n });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/instrumental/query/:taskId', async (req, res) => {
  try {
    const result = await mureka.queryInstrumentalTask(req.params.taskId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 配乐生成 ====================

/** POST /api/ai/soundtrack/generate */
router.post('/soundtrack/generate', async (req, res) => {
  try {
    const { prompt, model, n, duration } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ success: false, error: 'prompt不能为空' });
    const result = await mureka.generateSoundtrack({ prompt, model, n, duration });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 单轨生成 ====================

/** POST /api/ai/single-track/generate */
router.post('/single-track/generate', async (req, res) => {
  try {
    const { prompt, instrument, model } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ success: false, error: 'prompt不能为空' });
    const result = await mureka.generateSingleTrack({ prompt, instrument, model });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 局部编辑 ====================

/** POST /api/ai/song/edit */
router.post('/song/edit', async (req, res) => {
  try {
    const { song_id, edit_type, start_ms, end_ms, lyrics, prompt, tempo, key } = req.body;
    if (!song_id) return res.status(400).json({ success: false, error: 'song_id不能为空' });
    if (!edit_type) return res.status(400).json({ success: false, error: 'edit_type不能为空' });
    const result = await mureka.editSong({ song_id, edit_type, start_ms, end_ms, lyrics, prompt, tempo, key });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 歌曲混音 ====================

/** POST /api/ai/song/remix */
router.post('/song/remix', async (req, res) => {
  try {
    const { song_id, style, prompt, model } = req.body;
    if (!song_id) return res.status(400).json({ success: false, error: 'song_id不能为空' });
    const result = await mureka.remixSong({ song_id, style, prompt, model });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 文件上传 ====================

/** POST /api/ai/files/upload */
router.post('/files/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '文件不能为空' });
    const purpose = req.body.purpose || 'audio';
    const result = await mureka.uploadFile(req.file.buffer, req.file.originalname, purpose as any);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 歌曲识别与理解 ====================

router.post('/song/recognize', async (req, res) => {
  try {
    const { upload_audio_id } = req.body;
    if (!upload_audio_id) return res.status(400).json({ success: false, error: 'upload_audio_id不能为空' });
    const result = await mureka.recognizeSong(upload_audio_id);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/song/describe', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'url不能为空' });
    const result = await mureka.describeSong(url);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/song/stem', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'url不能为空' });
    const result = await mureka.stemSong(url);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 歌词视频 ====================

/** POST /api/ai/song/lyrics-video */
router.post('/song/lyrics-video', async (req, res) => {
  try {
    const { song_id, style, resolution } = req.body;
    if (!song_id) return res.status(400).json({ success: false, error: 'song_id不能为空' });
    const result = await mureka.generateLyricsVideo({ song_id, style, resolution });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== TTS 语音 ====================

/** POST /api/ai/tts/generate */
router.post('/tts/generate', async (req, res) => {
  try {
    const { text, voice, speed, pitch } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, error: 'text不能为空' });
    const result = await mureka.generateTTS({ text, voice, speed, pitch });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/ai/tts/podcast - 创建播客 */
router.post('/tts/podcast', async (req, res) => {
  try {
    const { script, voices, style } = req.body;
    if (!script || !Array.isArray(script) || script.length === 0) {
      return res.status(400).json({ success: false, error: 'script必须是非空数组' });
    }
    const result = await mureka.generatePodcast({ script, voices, style });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 国风智能功能快捷入口 ====================

/** POST /api/ai/guofeng/generate - 国风歌曲一键生成 */
router.post('/guofeng/generate', async (req, res) => {
  try {
    const { poem, style, instrument_prompt, model } = req.body;
    if (!poem?.trim()) return res.status(400).json({ success: false, error: '诗词内容不能为空' });

    const targetModel = model || mureka.MUREKA_MODELS.O1;

    const lyricsResult = await mureka.generateLyrics(
      `根据以下古诗词创作一首国风歌曲歌词，风格：${style || '古风雅韵'}，配器：${instrument_prompt || '古琴、琵琶、笛子、二胡、编钟'}\n\n诗词原文：\n${poem}`
    );

    const songTask = await mureka.generateSong({
      lyrics: lyricsResult.lyrics,
      prompt: `国风古韵，${style || '古风雅韵'}风格，配器使用${instrument_prompt || '古琴、琵琶、笛子、箫、编钟'}等中国传统乐器，五声音阶旋律，意境深远悠长`,
      model: targetModel,
      n: 1,
    });

    res.json({
      success: true,
      data: {
        lyrics: lyricsResult.lyrics,
        title: lyricsResult.title,
        task: songTask,
        model: targetModel,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/ai/guofeng/instrumental - 国风纯音乐生成 */
router.post('/guofeng/instrumental', async (req, res) => {
  try {
    const { scene, mood, instruments, duration_hint, model } = req.body;
    const prompt = `创作一首${mood || '悠远空灵'}的中国传统风格纯音乐，场景：${scene || '山水田园'}，配器：${instruments || '古琴、竹笛、古筝、箫'}，${duration_hint ? '时长约' + duration_hint + '秒' : ''}，五声音阶旋律，留白意境`;
    const result = await mureka.generateInstrumental({ prompt, model: model || mureka.MUREKA_MODELS.O1, n: 1 });
    res.json({ success: true, data: { ...result, model: model || mureka.MUREKA_MODELS.O1 } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/ai/guofeng/opera - 戏曲伴奏生成 */
router.post('/guofeng/opera', async (req, res) => {
  try {
    const { genre, aria_name, model } = req.body;
    const operaMap: Record<string, string> = {
      jingju: '京剧',
      kunqu: '昆曲',
      yueju: '粤剧',
      huangmei: '黄梅戏',
      yuju: '豫剧',
      qinqiang: '秦腔',
    };
    const genreName = operaMap[genre] || '京剧';
    const prompt = `创作一段${genreName}风格的戏曲伴奏，曲目：${aria_name || '经典唱段'}，配器使用${genreName}传统乐器（${genre === 'jingju' ? '京胡/板鼓/大锣' : genre === 'kunqu' ? '曲笛/笙/鼓板' : genre === 'yueju' ? '高胡/扬琴/秦琴' : '传统戏曲乐器'}），板式节奏鲜明，唱腔伴奏风格纯正`;
    const result = await mureka.generateInstrumental({ prompt, model: model || mureka.MUREKA_MODELS.O1, n: 1 });
    res.json({ success: true, data: { ...result, genre: genreName, model: model || mureka.MUREKA_MODELS.O1 } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** POST /api/ai/guofeng/orchestra - 民乐团编制生成 */
router.post('/guofeng/orchestra', async (req, res) => {
  try {
    const { style, mood, tempo, instruments_config, model } = req.body;
    // 构建分声部 prompt
    const parts: string[] = [];
    if (instruments_config?.wind) parts.push(`吹管：${instruments_config.wind}`);
    if (instruments_config?.plucked) parts.push(`弹拨：${instruments_config.plucked}`);
    if (instruments_config?.percussion) parts.push(`打击：${instruments_config.percussion}`);
    if (instruments_config?.bowed) parts.push(`拉弦：${instruments_config.bowed}`);

    const prompt = `创作一首中国传统民乐团编制乐曲，风格：${style || '宫廷雅乐'}，情绪：${mood || '庄重典雅'}，速度：${tempo || '中板'}。配器编制：${parts.length > 0 ? parts.join('；') : '吹管(笛/箫/笙/唢呐)、弹拨(琵琶/古筝/中阮)、打击(编钟/鼓/锣)、拉弦(二胡/中胡/马头琴)'}。要求各声部层次分明，主旋律突出，和声丰富，体现民乐团恢弘气势。`;
    const result = await mureka.generateSong({
      lyrics: '纯器乐演奏',
      prompt,
      model: model || mureka.MUREKA_MODELS.O1,
      n: 1,
    });
    res.json({ success: true, data: { ...result, model: model || mureka.MUREKA_MODELS.O1 } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== 音乐下载保存 ====================

const __aiDir = dirname(fileURLToPath(import.meta.url));
const SONGS_DIR = resolve(__aiDir, '../public/uploads/songs');
mkdirSync(SONGS_DIR, { recursive: true });

/** POST /api/ai/song/save - 下载Mureka生成的音频到本地永久保存 */
router.post('/song/save', async (req, res) => {
  try {
    const { url, title, metadata } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'url不能为空' });

    const songTitle = (title || '未命名').replace(/[<>:"/\\|?*]/g, '_');
    const uuid = randomUUID();
    const filename = `${songTitle}_${uuid.slice(0, 8)}.mp3`;
    const filePath = resolve(SONGS_DIR, filename);

    // 流式下载
    const writer = createWriteStream(filePath);
    const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 300000 });
    response.data.pipe(writer);

    await new Promise<void>((ok, fail) => {
      writer.on('finish', ok);
      writer.on('error', fail);
    });

    const { statSync } = await import('fs');
    const stat = statSync(filePath);
    const localPath = `/uploads/songs/${filename}`;

    // 写入音源表记录
    const db = (await import('../db/index.js')).default;
    const catId = (metadata?.category === 'bowed' ? 4 : metadata?.category === 'percussion' ? 3 : metadata?.category === 'wind' ? 1 : 2);
    const newId = db.getMaxId('instruments') + 1;
    db.run(`
      INSERT INTO instruments (id, name, category_id, element_id, description, file_path, file_size, bpm, key_signature, scale_type, is_builtin, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `, [
      newId,
      songTitle,
      catId,
      metadata?.element_id || 1,
      metadata?.description || `Mureka AI 生成: ${songTitle}`,
      localPath,
      stat.size,
      null, null, null,
    ]);

    db.log('create', 'instrument', newId, `AI生成音源: ${songTitle}`);

    // 同时写入创作记录表
    try {
      const genId = db.insert('ai_generations', {
        title: songTitle,
        file_path: localPath,
        file_size: stat.size,
        model: metadata?.model || '',
        style: metadata?.style || metadata?.category || '',
        prompt: metadata?.prompt || metadata?.description || '',
        lyrics: metadata?.lyrics || '',
        status: 'completed',
        is_deleted: 0,
        mureka_task: metadata?.task_id ? JSON.stringify({ task_id: metadata.task_id }) : '',
        metadata: JSON.stringify(metadata || {}),
      });
    } catch (e: any) {
      console.warn('[AI-SAVE] 创作记录写入失败:', e.message);
    }

    res.json({
      success: true,
      data: {
        id: newId,
        name: songTitle,
        file_path: localPath,
        file_size: stat.size,
        local_url: `http://localhost:5653${localPath}`,
        original_url: url,
      },
    });
  } catch (err: any) {
    console.error('[AI-SAVE]', err.message);
    res.status(500).json({ success: false, error: `保存失败: ${err.message}` });
  }
});

/** POST /api/ai/song/save-batch - 批量保存轮询结果中的所有音频 */
router.post('/song/save-batch', async (req, res) => {
  try {
    const { choices, title, metadata } = req.body;
    const items = (choices || []).filter((c: any) => c.url || c.audio_url);
    if (items.length === 0) return res.status(400).json({ success: false, error: '没有可保存的音频' });

    const results = [];
    const db = (await import('../db/index.js')).default;
    const { statSync } = await import('fs');

    for (let i = 0; i < items.length; i++) {
      const url = items[i].url || items[i].audio_url;
      const idx = items.length > 1 ? `_${i + 1}` : '';
      const songTitle = ((title || 'AI生成') + idx).replace(/[<>:"/\\|?*]/g, '_');
      const uuid = randomUUID();
      const filename = `${songTitle}_${uuid.slice(0, 8)}.mp3`;
      const filePath = resolve(SONGS_DIR, filename);

      const writer = createWriteStream(filePath);
      const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 300000 });
      response.data.pipe(writer);
      await new Promise<void>((ok, fail) => { writer.on('finish', ok); writer.on('error', fail); });

      const stat = statSync(filePath);
      const localPath = `/uploads/songs/${filename}`;
      const catId = (metadata?.category === 'bowed' ? 4 : metadata?.category === 'percussion' ? 3 : metadata?.category === 'wind' ? 1 : 2);
      const newId = db.getMaxId('instruments') + 1;
      db.run(`
        INSERT INTO instruments (id, name, category_id, element_id, description, file_path, file_size, bpm, key_signature, scale_type, is_builtin, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      `, [newId, songTitle, catId, metadata?.element_id || 1, `Mureka AI 生成: ${songTitle}`, localPath, stat.size, null, null, null]);

      results.push({ id: newId, name: songTitle, file_path: localPath, file_size: stat.size, local_url: `http://localhost:5653${localPath}` });

      try {
        db.insert('ai_generations', {
          title: songTitle,
          file_path: localPath,
          file_size: stat.size,
          model: metadata?.model || '',
          style: metadata?.style || metadata?.category || '',
          prompt: metadata?.prompt || '',
          lyrics: metadata?.lyrics || items[i].lyrics || '',
          status: 'completed',
          is_deleted: 0,
          metadata: JSON.stringify(metadata || {}),
        });
      } catch (e: any) {
        console.warn('[AI-SAVE-BATCH] 创作记录写入失败:', e.message);
      }
    }

    db.log('create', 'instrument', 0, `批量保存AI生成${results.length}首`);
    res.json({ success: true, data: results });
  } catch (err: any) {
    console.error('[AI-SAVE-BATCH]', err.message);
    res.status(500).json({ success: false, error: `批量保存失败: ${err.message}` });
  }
});

// ==================== 模型信息 ====================

/** GET /api/ai/models - 获取可用模型列表 */
router.get('/models', (_req, res) => {
  res.json({
    success: true,
    data: {
      models: [
        { id: 'mureka-7.6', name: 'V7.6 标准模型', description: '提升旋律与编曲质量，支持流式输出', supports_stream: true },
        { id: 'mureka-o2', name: 'O1 思维链模型', description: '思维链甄选，多语言创作，音乐理解力更强', supports_stream: false, is_o1: true },
        { id: 'mureka-8', name: 'V8 升级模型', description: '更高质量音乐生成', supports_stream: true },
        { id: 'mureka-9', name: 'V9 最新模型', description: '最高质量音乐生成', supports_stream: true },
      ],
    },
  });
});
