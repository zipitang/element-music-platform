/**
 * ============================================================
 *  元素音乐编曲管理平台 - Express 后端服务器
 *  端口: 5653 | 数据库: SQLite (sql.js WASM)
 * ============================================================
 */
import express from 'express';
import cors from 'cors';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { createServer } from 'http';
import db from './db/index.js';

// 路由直接导入
import { router as instrumentsRouter } from './routes/instruments.js';
import { router as projectsRouter } from './routes/projects.js';
import { router as tracksRouter } from './routes/tracks.js';
import { router as mixingRouter } from './routes/mixing.js';
import { router as copyrightRouter } from './routes/copyright.js';
import { router as templatesRouter } from './routes/templates.js';
import { router as systemRouter } from './routes/system.js';
import { router as filesRouter } from './routes/files.js';
import { router as aiRouter } from './routes/ai.js';
import { router as aiGenerationsRouter } from './routes/ai-generations.js';
import { router as authRouter } from './routes/auth.js';
import { router as usersRouter } from './routes/users.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = resolve(__dirname, 'public/uploads');

// 确保上传目录存在
const subDirs = ['instruments', 'projects', 'tracks', 'mixing', 'copyright', 'covers', 'lyrics', 'css', 'packages', 'songs'];
for (const dir of subDirs) {
  mkdirSync(resolve(UPLOAD_DIR, dir), { recursive: true });
}

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.PORT || '5653', 10);

// ==================== 中间件 ====================

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-File-Hash', 'X-Total-Count'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', etag: true, index: false }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms > 200) console.log(`[API] ${req.method} ${req.path} ${ms}ms`);
  });
  next();
});

// ==================== 路由注册 ====================

app.use('/api/instruments', instrumentsRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/mixing', mixingRouter);
app.use('/api/copyright', copyrightRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/system', systemRouter);
app.use('/api/files', filesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/ai-generations', aiGenerationsRouter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: '元素音乐编曲管理平台 API 正常运行', version: '1.0.0', db: 'connected' });
});

// ==================== 生产静态文件 ====================

const distPath = resolve(__dirname, '../dist');
if (existsSync(distPath)) {
  app.use(express.static(distPath, { maxAge: '7d', etag: true }));
  // SPA fallback：非 API 路由返回 index.html
  app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => {
    res.sendFile(resolve(distPath, 'index.html'));
  });
}

// ==================== 错误处理 ====================

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  res.status(err.status || 500).json({ success: false, error: err.message || '服务器内部错误' });
});

app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({ success: false, error: `接口不存在: ${req.method} ${req.path}`, code: 'NOT_FOUND' });
});

// ==================== 启动 ====================

async function main() {
  try {
    await db.init();
    db.startAutoSave(15000);

    // 生产环境仅监听本机，由 nginx 反向代理对外提供服务，避免绕过网关直连
    server.listen(PORT, process.env.HOST || '127.0.0.1', () => {
      console.log('');
      console.log('  ╔══════════════════════════════════════════╗');
      console.log('  ║   元素音乐编曲管理平台 · 后端服务已启动    ║');
      console.log('  ║   API:  http://localhost:5653/api          ║');
      console.log('  ║   AI:   http://localhost:5653/api/ai       ║');
      console.log('  ║   文件: http://localhost:5653/uploads      ║');
      console.log('  ╚══════════════════════════════════════════╝');
      console.log('');
    });
  } catch (err) {
    console.error('[FATAL] 后端启动失败:', err);
    process.exit(1);
  }
}

main();

process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] 正在关闭服务器...');
  db.close();
  server.close(() => process.exit(0));
});
