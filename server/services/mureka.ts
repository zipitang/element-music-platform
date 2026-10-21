/**
 * ============================================================
 *  Mureka AI 音乐 API 代理服务层 v2.0
 *  Base URL: https://api.mureka.cn
 *  认证: Bearer Token
 *  支持模型: mureka-7.6 | mureka-o2 | mureka-8 | mureka-9
 *  O1模型说明: mureka-o2 为思维链甄选模型，多语言创作
 *             不支持 stream 模式，生成后需通过 /v1/song/query 获取结果
 * ============================================================
 */

import axios from 'axios';
import FormData from 'form-data';

const MUREKA_BASE = 'https://api.mureka.cn';
const MUREKA_API_KEY = process.env.MUREKA_API_KEY || 'op_lzem2nz9phli6i7w7m5zd5kns58yr3ei3';

/** Mureka HTTP 客户端 */
const mureka = axios.create({
  baseURL: MUREKA_BASE,
  timeout: 180000,
  headers: {
    'Authorization': `Bearer ${MUREKA_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

function checkResponse(res: any) {
  if (res.status >= 200 && res.status < 300) return res.data;
  const errMsg = res.data?.error?.message || `Mureka API error: ${res.status}`;
  throw new Error(errMsg);
}

// ==================== 模型常量 ====================

export const MUREKA_MODELS = {
  AUTO: 'auto',
  V7_6: 'mureka-7.6',
  O1: 'mureka-o2',   // O1 思维链模型 (API 命名为 mureka-o2)
  V8: 'mureka-8',
  V9: 'mureka-9',
} as const;

export const TASK_STATUS = {
  PREPARING: 'preparing',
  QUEUED: 'queued',
  RUNNING: 'running',
  STREAMING: 'streaming',
  REVIEWING: 'reviewing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  TIMEOUTED: 'timeouted',
  CANCELLED: 'cancelled',
} as const;

/** 已完成状态 */
const DONE_STATUSES = new Set([TASK_STATUS.SUCCEEDED, TASK_STATUS.FAILED, TASK_STATUS.TIMEOUTED, TASK_STATUS.CANCELLED]);

/** 是否 O1 模型 (不支持 stream) */
function isO1Model(model?: string) {
  return model === MUREKA_MODELS.O1;
}

// ==================== 歌词生成 ====================

export async function generateLyrics(prompt: string) {
  const res = await mureka.post('/v1/lyrics/generate', { prompt });
  return checkResponse(res);
}

export async function extendLyrics(lyrics: string) {
  const res = await mureka.post('/v1/lyrics/extend', { lyrics });
  return checkResponse(res);
}

// ==================== 歌曲生成 ====================

export async function generateSong(data: {
  lyrics: string;
  prompt?: string;
  model?: string;
  n?: number;
  reference_id?: string;
  vocal_id?: string;
  melody_id?: string;
  instrumental_id?: string;
  stream?: boolean;
}) {
  // O1 模型强制 stream=false
  const payload = {
    ...data,
    stream: isO1Model(data.model) ? false : (data.stream ?? false),
  };
  const res = await mureka.post('/v1/song/generate', payload);
  return checkResponse(res);
}

export async function extendSong(data: {
  song_id?: string;
  upload_audio_id?: string;
  lyrics?: string;
  extend_at: number;
}) {
  const res = await mureka.post('/v1/song/extend', data);
  return checkResponse(res);
}

export async function querySongTask(taskId: string) {
  const res = await mureka.get(`/v1/song/query/${taskId}`);
  return checkResponse(res);
}

// ==================== 音色克隆 ====================

/**
 * 音色克隆 - 上传参考音频创建可复用的音色
 */
export async function cloneVoice(data: {
  upload_audio_id: string;
  voice_name?: string;
  description?: string;
}) {
  const res = await mureka.post('/v1/voice/clone', data);
  return checkResponse(res);
}

/**
 * 获取已克隆的音色列表
 */
export async function listVoices() {
  const res = await mureka.get('/v1/voice/list');
  return checkResponse(res);
}

// ==================== 纯音乐生成 ====================

export async function generateInstrumental(data: {
  prompt?: string;
  instrumental_id?: string;
  model?: string;
  n?: number;
}) {
  const res = await mureka.post('/v1/instrumental/generate', data);
  return checkResponse(res);
}

export async function queryInstrumentalTask(taskId: string) {
  const res = await mureka.get(`/v1/instrumental/query/${taskId}`);
  return checkResponse(res);
}

// ==================== 配乐生成 ====================

/**
 * 生成配乐/背景音乐 (soundtrack/BGM)
 * 适用于视频配乐、场景音乐等有明确情绪/场景描述的场景
 */
export async function generateSoundtrack(data: {
  prompt: string;
  model?: string;
  n?: number;
  duration?: number;
}) {
  const res = await mureka.post('/v1/soundtrack/generate', data);
  return checkResponse(res);
}

// ==================== 单轨生成 ====================

/**
 * 单轨生成 - 按乐器独立生成音轨
 * 适合单独生成某个乐器声部
 */
export async function generateSingleTrack(data: {
  prompt: string;
  instrument?: string;
  model?: string;
}) {
  const res = await mureka.post('/v1/song/single-track', data);
  return checkResponse(res);
}

// ==================== 局部编辑 ====================

/**
 * 局部编辑歌曲 - 针对已生成歌曲的局部进行修改
 */
export async function editSong(data: {
  song_id: string;
  edit_type: 'replace_lyrics' | 'replace_melody' | 'adjust_tempo' | 'change_key' | 'change_style';
  start_ms?: number;
  end_ms?: number;
  lyrics?: string;
  prompt?: string;
  tempo?: number;
  key?: string;
}) {
  const res = await mureka.post('/v1/song/edit', data);
  return checkResponse(res);
}

// ==================== 歌曲混音 ====================

/**
 * 歌曲混音/Remix
 */
export async function remixSong(data: {
  song_id: string;
  style?: string;
  prompt?: string;
  model?: string;
}) {
  const res = await mureka.post('/v1/song/remix', data);
  return checkResponse(res);
}

// ==================== 文件上传 ====================

export async function uploadFile(
  file: Buffer,
  filename: string,
  purpose: 'reference' | 'vocal' | 'melody' | 'instrumental' | 'voice' | 'audio'
) {
  const form = new FormData();
  form.append('file', file, filename);
  form.append('purpose', purpose);

  const res = await mureka.post('/v1/files/upload', form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return checkResponse(res);
}

// ==================== 分块上传 (新API) ====================

/** 创建上传对象 */
export async function createUpload(data: {
  filename: string;
  purpose: string;
  total_size: number;
}) {
  const res = await mureka.post('/v1/files/upload/create', data);
  return checkResponse(res);
}

/** 追加分块数据 */
export async function appendUpload(uploadId: string, chunk: Buffer, partNumber: number) {
  const form = new FormData();
  form.append('upload_id', uploadId);
  form.append('part_number', partNumber);
  form.append('data', chunk, 'chunk');
  const res = await mureka.post('/v1/files/upload/append', form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return checkResponse(res);
}

/** 完成上传 */
export async function completeUpload(uploadId: string) {
  const res = await mureka.post('/v1/files/upload/complete', { upload_id: uploadId });
  return checkResponse(res);
}

// ==================== 歌曲识别与理解 ====================

export async function recognizeSong(uploadAudioId: string) {
  const res = await mureka.post('/v1/song/recognize', { upload_audio_id: uploadAudioId });
  return checkResponse(res);
}

export async function describeSong(url: string) {
  const res = await mureka.post('/v1/song/describe', { url });
  return checkResponse(res);
}

export async function stemSong(url: string) {
  const res = await mureka.post('/v1/song/stem', { url });
  return checkResponse(res);
}

// ==================== TTS 语音 ====================

export async function generateTTS(data: { text: string; voice?: string; speed?: number; pitch?: number }) {
  const res = await mureka.post('/v1/tts/generate', data);
  return checkResponse(res);
}

/**
 * 创建播客
 */
export async function generatePodcast(data: {
  script: Array<{ speaker: string; text: string }>;
  voices?: Record<string, string>;
  style?: string;
}) {
  const res = await mureka.post('/v1/speech/podcast', data);
  return checkResponse(res);
}

// ==================== 歌词视频 ====================

/**
 * 生成歌词视频
 */
export async function generateLyricsVideo(data: {
  song_id: string;
  style?: string;
  resolution?: string;
}) {
  const res = await mureka.post('/v1/song/lyrics-video', data);
  return checkResponse(res);
}

// ==================== 通用轮询工具 ====================

/**
 * 轮询等待任务完成
 * 支持 O1 模型（更长生成时间）
 */
export async function pollTask(
  taskId: string,
  queryFn: (id: string) => Promise<any>,
  options?: {
    intervalMs?: number;
    timeoutMs?: number;
    onProgress?: (status: string, result: any) => void;
  }
): Promise<any> {
  const intervalMs = options?.intervalMs || 5000;
  const timeoutMs = options?.timeoutMs || 600000; // O1 模型可能更久，默认10分钟
  const onProgress = options?.onProgress;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await queryFn(taskId);
    const status = result.status;

    onProgress?.(status, result);

    if (DONE_STATUSES.has(status)) {
      if (status === TASK_STATUS.SUCCEEDED) {
        if (result.choices?.length > 0) return result;
        if (result.url) return result;
      }
      if (status === TASK_STATUS.FAILED) {
        throw new Error(result.failed_reason || 'AI生成任务失败');
      }
      if (status === TASK_STATUS.TIMEOUTED) {
        throw new Error('AI生成任务超时(服务端)');
      }
      if (status === TASK_STATUS.CANCELLED) {
        throw new Error('AI生成任务已被取消');
      }
      return result;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('AI生成任务超时(客户端)');
}

export default {
  MUREKA_MODELS,
  TASK_STATUS,
  generateLyrics,
  extendLyrics,
  generateSong,
  extendSong,
  querySongTask,
  cloneVoice,
  listVoices,
  generateInstrumental,
  queryInstrumentalTask,
  generateSoundtrack,
  generateSingleTrack,
  editSong,
  remixSong,
  uploadFile,
  createUpload,
  appendUpload,
  completeUpload,
  recognizeSong,
  describeSong,
  stemSong,
  generateTTS,
  generatePodcast,
  generateLyricsVideo,
  pollTask,
};
