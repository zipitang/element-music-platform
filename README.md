# 元素音乐编曲管理平台 (element-music-platform)

完整整合包 — 从 zhaopanyu 服务器 (156.226.178.124) 导出。

## 一、包内容

```
element-music-platform/
├── server/                 后端 (Node + TypeScript + Express)
│   ├── index.ts            主入口 (监听 PORT，默认 5653)
│   ├── routes/             13 个路由模块 (projects/tracks/users/auth/ai/...)
│   ├── services/           auth.ts, mureka.ts (AI 音乐生成)
│   ├── db/                 schema.ts, index.ts, element_music.db
│   ├── middleware/
│   └── public/uploads/     用户上传素材 (~32MB)
│       ├── songs/          生成的歌曲 mp3
│       ├── covers/         封面
│       ├── instruments/    乐器
│       ├── projects/       项目文件
│       ├── tracks/         音轨
│       ├── mixing/         混音
│       ├── lyrics/         歌词
│       ├── copyright/      版权
│       ├── packages/
│       └── css/
├── dist/                   前端构建产物 (Vue 3 + Vite，已编译)
├── data/                   SQLite 数据库
│   └── element-music.db
├── package.json            依赖与脚本
├── package-lock.json       锁定版本
├── deploy.sh               原服务器部署脚本
├── init_db.py              数据库初始化
├── register-service.py     服务注册脚本
└── _deploy/                服务器实际部署配置
    ├── nginx-gateway.conf  Nginx 反代配置 (含 /element-music/ 段)
    ├── pm2-describe.txt    PM2 进程配置
    └── listening.txt       端口监听快照
```

## 二、重要说明

### ⚠️ 前端无源码
`dist/` 是**已编译产物**，服务器上没有 `src/` 目录（Vite 源码未保留）。
- 可以直接运行/部署（后端会托管 dist）
- 但**无法二次修改前端**，除非另找源码
- 如需改动前端，需从原始开发目录获取 src

### ⚠️ API Key 硬编码
`server/services/mureka.ts` 第 16 行硬编码了 Mureka API Key：
```
MUREKA_API_KEY = process.env.MUREKA_API_KEY || 'op_...'
```
建议改为纯环境变量方式，避免泄露。

### 管理员账号
首次部署后请在数据库中替换为自定义用户名与强密码，切勿沿用示例默认值；生产环境不要在任何前端页面或文档中展示账号信息。

## 三、本地运行

```bash
# 1. 安装依赖（node_modules 未打包，需自行安装）
npm install

# 2. 启动（后端 + 前端静态托管，单端口 5653）
PORT=5653 npm run server
# 或
npm run dev:all    # 前端 vite dev + 后端 concurrently

# 3. 访问
http://localhost:5653
```

## 四、生产部署（还原到服务器）

```bash
# 解压到 /opt/element-music
tar xzf element-music-platform_*.tar.gz -C /opt/
mv /opt/element-music-platform_* /opt/element-music

cd /opt/element-music

# 安装生产依赖
npm install --omit=dev

# 用 PM2 启动（复用原配置）
pm2 delete element-music 2>/dev/null
PORT=5653 pm2 start server/index.ts --name element-music --node-args='--import tsx'
pm2 save

# Nginx：把 _deploy/nginx-gateway.conf 里 /element-music/ 段合并进站点配置
```

## 五、技术栈

- **后端**：Node.js + Express 4 + TypeScript (tsx 直跑) + sql.js (SQLite WASM)
- **前端**：Vue 3 + Vite 6 + Pinia + Vue Router + Tailwind + GSAP + Howler
- **AI**：Mureka API（音乐生成）
- **上传**：Multer
- **端口**：5653
- **托管**：PM2 (fork 模式)

## 六、导出信息

- 导出时间：20261017_083345
- 源服务器：156.226.178.124:/opt/element-music
- 导出方式：SFTP 打包下载（排除 node_modules 与日志）

---

## 七、本地改造记录（2026-10-17）

### 1. 音源素材已补全音频
原 58 条音源 `file_path` 全为空，手机端点了播不出声。已用 `03-乐器音效` 素材包补齐：

- 58 条民乐音源 → 按乐器名匹配素材包目录绑定真实样本
- 40 个平台没有的乐器 → 新增 `xxx·素材包` 音源（分类/五行自动推断，含新分类「电子与音效」）
- 现在 **98/98 条音源可播放**，音频在 `server/public/uploads/instruments/`（9.7 MB）
- 导入脚本：`tools/import_audio_pack.py`（幂等，支持 `--dry-run` / `--all-samples`）
- 详见 `../docs/素材包导入说明.md`
- 数据库备份：`data/element-music.db.bak-20261017`

⚠️ 脚本直接改 SQLite 文件，执行前请先停后端服务，改完再启动。

### 2. 已知后端缺陷（客户端已规避，未改后端）
- `projects` 表无 `template_id` 列：`POST /api/projects` 带该字段会静默失败却返回 `success:{id:0}`
- `GET /api/projects` 的 `track_count` 恒为 null（路由用了 sql.js 不支持的 `prepare().get()`）
- 版权接口是单数路径 `/api/copyright`
- 工程状态实际取值 `draft / recording / mixing / mastered`
