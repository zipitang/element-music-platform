/**
 * ============================================================
 *  元素音乐编曲管理平台 - 模块化数据库架构
 *  设计原则：
 *    1. 每张表独立自洽，支持离线/在线双模式
 *    2. 外键软关联（FK_CHECK=OFF），保证高并发写入稳定
 *    3. JSON字段存储扩展元数据，避免频繁ALTER
 *    4. 统一审计字段：created_at / updated_at / is_deleted
 *    5. 全文搜索用FTS5虚拟表
 * ============================================================
 */

export const SCHEMA_SQL = `
-- ==================== 核心分类表 ====================

-- 乐器分类（吹管/弹拨/打击/拉弦）
CREATE TABLE IF NOT EXISTS instrument_categories (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,           -- 分类名称
  icon          TEXT DEFAULT '',                -- 分类图标标识
  sort_order    INTEGER DEFAULT 0,              -- 排序
  description   TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- 五行元素分类（金木水火土）
CREATE TABLE IF NOT EXISTS elements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,           -- metal/wood/water/fire/earth
  name          TEXT NOT NULL,                   -- 金/木/水/火/土
  color_primary TEXT NOT NULL,                   -- 主题色 #hex
  color_secondary TEXT DEFAULT '',
  color_dark    TEXT DEFAULT '',                 -- 暗底色
  description   TEXT DEFAULT '',
  icon          TEXT DEFAULT '',
  sort_order    INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- 标签系统
CREATE TABLE IF NOT EXISTS tags (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  color         TEXT DEFAULT '#ffffff',
  category      TEXT DEFAULT 'general',         -- general/mood/tempo/instrument/era
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ==================== 用户系统 ====================

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT DEFAULT 'user',            -- admin / user
  nickname      TEXT DEFAULT '',
  avatar        TEXT DEFAULT '',
  status        INTEGER DEFAULT 1,              -- 1正常 0禁用
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- ==================== 音源素材库（金） ====================

-- 音源主表
CREATE TABLE IF NOT EXISTS instruments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,                   -- 音源名称
  category_id   INTEGER REFERENCES instrument_categories(id),
  element_id    INTEGER REFERENCES elements(id),  -- 关联五行
  description   TEXT DEFAULT '',
  file_path     TEXT DEFAULT '',                  -- 音频文件路径
  file_hash     TEXT DEFAULT '',                  -- MD5校验
  file_size     INTEGER DEFAULT 0,                -- 字节
  duration      REAL DEFAULT 0,                   -- 时长(秒)
  sample_rate   INTEGER DEFAULT 44100,
  bit_depth     INTEGER DEFAULT 16,
  channels      INTEGER DEFAULT 2,
  format        TEXT DEFAULT 'mp3',              -- mp3/wav/flac/ogg
  cover_path    TEXT DEFAULT '',                  -- 封面图路径
  waveform_data TEXT DEFAULT '',                  -- 波形JSON(采样点)
  tags_json     TEXT DEFAULT '[]',               -- 标签ID数组JSON
  metadata_json TEXT DEFAULT '{}',               -- 扩展元数据(调式/节拍/BPM等)
  is_builtin    INTEGER DEFAULT 0,               -- 内置音源
  is_favorite   INTEGER DEFAULT 0,
  play_count    INTEGER DEFAULT 0,
  rating        REAL DEFAULT 0,                  -- 评分 0-5
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- 乐器标签关联（多对多）
CREATE TABLE IF NOT EXISTS instrument_tags (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  instrument_id INTEGER NOT NULL,
  tag_id        INTEGER NOT NULL,
  UNIQUE(instrument_id, tag_id)
);

-- ==================== 编曲工程（木） ====================

-- 工程目录树
CREATE TABLE IF NOT EXISTS project_folders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id     INTEGER DEFAULT 0,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  sort_order    INTEGER DEFAULT 0,
  element_id    INTEGER REFERENCES elements(id),
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- 工程主表
CREATE TABLE IF NOT EXISTS projects (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id     INTEGER DEFAULT 0,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  bpm           INTEGER DEFAULT 120,
  time_signature TEXT DEFAULT '4/4',
  key_signature TEXT DEFAULT 'C',
  scale_type    TEXT DEFAULT 'pentatonic',
  genre         TEXT DEFAULT '',
  status        TEXT DEFAULT 'draft',            -- draft/recording/mixing/mastered
  duration      REAL DEFAULT 0,
  element_id    INTEGER REFERENCES elements(id),
  tags_json     TEXT DEFAULT '[]',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- ==================== 多轨编曲（水） ====================

-- 轨道
CREATE TABLE IF NOT EXISTS tracks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER NOT NULL,
  name          TEXT NOT NULL,
  track_type    TEXT DEFAULT 'audio',            -- audio/midi/master
  instrument_id INTEGER DEFAULT 0,
  volume        REAL DEFAULT 0.8,
  pan           REAL DEFAULT 0.5,
  color         TEXT DEFAULT '#ffffff',
  sort_order    INTEGER DEFAULT 0,
  height        INTEGER DEFAULT 80,
  is_mute       INTEGER DEFAULT 0,
  is_solo       INTEGER DEFAULT 0,
  fx_json       TEXT DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- 轨道片段
CREATE TABLE IF NOT EXISTS track_clips (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id      INTEGER NOT NULL,
  name          TEXT NOT NULL,
  clip_type     TEXT DEFAULT 'audio',
  start_time    REAL DEFAULT 0,
  end_time      REAL DEFAULT 0,
  offset        REAL DEFAULT 0,
  gain          REAL DEFAULT 1.0,
  fade_in       REAL DEFAULT 0,
  fade_out      REAL DEFAULT 0,
  file_path     TEXT DEFAULT '',
  midi_data     TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- 自动化曲线
CREATE TABLE IF NOT EXISTS automations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id      INTEGER NOT NULL,
  param_name    TEXT NOT NULL,                   -- volume/pan/filter/...
  points_json   TEXT DEFAULT '[]',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- ==================== 混音频谱（火） ====================

-- 混音预设
CREATE TABLE IF NOT EXISTS mix_presets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  category      TEXT DEFAULT 'user',
  config_json   TEXT DEFAULT '{}',
  is_builtin    INTEGER DEFAULT 0,
  element_id    INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- 混音效果器链
CREATE TABLE IF NOT EXISTS fx_chains (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id      INTEGER NOT NULL,
  preset_id     INTEGER DEFAULT 0,
  chain_json    TEXT DEFAULT '[]',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- ==================== 版权登记 ====================

CREATE TABLE IF NOT EXISTS copyrights (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    INTEGER DEFAULT 0,
  title         TEXT NOT NULL,
  author        TEXT DEFAULT '',
  registration_no TEXT DEFAULT '',
  work_type     TEXT DEFAULT 'composition',      -- composition/arrangement/lyrics
  status        TEXT DEFAULT 'draft',            -- draft/submitted/certified
  description   TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- ==================== 模板工坊（土） ====================

CREATE TABLE IF NOT EXISTS templates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  type          TEXT DEFAULT 'custom',            -- builtin/solar_term/genre/custom
  subtype       TEXT DEFAULT '',
  bpm           INTEGER DEFAULT 120,
  key_signature TEXT DEFAULT 'C',
  scale_type    TEXT DEFAULT 'pentatonic',
  genre         TEXT DEFAULT '',
  element_id    INTEGER DEFAULT 1,
  config_json   TEXT DEFAULT '{}',
  tags_json     TEXT DEFAULT '[]',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now')),
  is_deleted    INTEGER DEFAULT 0
);

-- ==================== AI 创作记录 ====================

CREATE TABLE IF NOT EXISTS ai_generations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  file_path     TEXT DEFAULT '',
  file_size     INTEGER DEFAULT 0,
  duration      REAL DEFAULT 0,
  model         TEXT DEFAULT '',
  style         TEXT DEFAULT '',
  prompt        TEXT DEFAULT '',
  lyrics        TEXT DEFAULT '',
  status        TEXT DEFAULT 'pending',
  is_deleted    INTEGER DEFAULT 0,
  mureka_task   TEXT DEFAULT '',
  metadata      TEXT DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ==================== 系统配置 ====================

CREATE TABLE IF NOT EXISTS app_settings (
  key           TEXT PRIMARY KEY,
  value_json    TEXT DEFAULT '{}',
  description   TEXT DEFAULT ''
);

-- ==================== 活动日志 ====================

CREATE TABLE IF NOT EXISTS activity_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  action        TEXT NOT NULL,
  target_type   TEXT DEFAULT '',
  target_id     INTEGER DEFAULT 0,
  detail        TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now'))
);

`;

export const SEED_SQL = `
-- ==================== 基础分类种子数据 ====================

INSERT OR IGNORE INTO instrument_categories (id, name, icon, sort_order, description) VALUES
(1, '吹管乐器', 'wind', 1, '包括笛子、箫、唢呐、笙、埙、管子等民族吹奏乐器'),
(2, '弹拨乐器', 'pluck', 2, '包括古筝、琵琶、阮、扬琴、三弦、箜篌等弹拨乐器'),
(3, '打击乐器', 'percussion', 3, '包括鼓、编钟、编磬、锣、钹、木鱼等打击乐器'),
(4, '拉弦乐器', 'bowed', 4, '包括二胡、京胡、高胡、板胡、马头琴等拉弦乐器');

-- 五行元素种子
INSERT OR IGNORE INTO elements (id, code, name, color_primary, color_dark, color_secondary, description, icon, sort_order) VALUES
(1, 'metal', '金', '#c9a84c', '#8b7328', '#f0d680', '编钟、锣等金属乐器，声如金石', 'metal_icon', 1),
(2, 'wood',  '木', '#4a7c59', '#2d4a3a', '#7ec48f', '笛、箫、古琴等竹木乐器', 'wood_icon', 2),
(3, 'water','水', '#4a7eb5', '#2c4a6a', '#8ec4f0', '古筝、琵琶等流水般旋律', 'water_icon', 3),
(4, 'fire', '火', '#c43c2c', '#7a2018', '#f06050', '唢呐、鼓等激昂火热的打击与吹奏', 'fire_icon', 4),
(5, 'earth','土', '#8b6b4a', '#5c462e', '#c4a47e', '埙、笙等浑厚大地之音', 'earth_icon', 5);

-- ==================== 用户种子（管理员） ====================
-- 密码: 000000 → SHA256 = 670b14728ad9902aecba32e22fa4f6bd7640f4b2e1c3f6a73b4e2e6a8b9163f1
INSERT OR IGNORE INTO users (id, username, password_hash, role, nickname, status) VALUES
(1, 'admin', '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203', 'admin', '系统管理员', 1);

-- ==================== 音源种子数据（58种） ====================

-- 吹管乐器 (17种)
INSERT OR IGNORE INTO instruments (id, name, category_id, element_id, description, file_path, file_size, is_builtin) VALUES
(1, '笛子(dizi)', 1, 2, '竹制横吹乐器，音色清脆明亮，D调曲笛为中音常用', '/demo/dizi_c.mp3', 1048576, 1),
(2, '洞箫(xiao)', 1, 2, '竖吹竹管乐器，音色低沉悠远，适合忧伤悠扬的旋律', '/demo/xiao_d.mp3', 983040, 1),
(3, '唢呐(suona)', 1, 4, '双簧气鸣乐器，音量宏大，音色高亢嘹亮，民间庆典必备', '/demo/suona_d.mp3', 891289, 1),
(4, '笙(sheng)', 1, 1, '自由簧管乐器，可奏和声，音色柔和，是吹打乐的灵魂乐器', '/demo/sheng.mp3', 786432, 1),
(5, '管子(guanzi)', 1, 4, '双簧吹奏，音色粗犷嘹亮，北方吹打乐主奏', '/demo/guanzi.mp3', 655360, 1),
(6, '埙(xun)', 1, 5, '陶土烧制闭口吹奏，七千年前河姆渡文化遗风，音色苍凉古朴', '/demo/xun_f.mp3', 589824, 1),
(7, '排箫(paixiao)', 1, 2, '多管排列气鸣，音色空灵飘逸，宛如风中仙乐', '/demo/paixiao.mp3', 720896, 1),
(8, '巴乌(bawu)', 1, 5, '簧管竖吹乐器，音色浑厚柔美，傣族彝族的灵魂之声', '/demo/bawu.mp3', 524288, 1),
(9, '葫芦丝(hulusi)', 1, 5, '簧管乐器，音色柔美动人，云南傣族的代表性乐器', '/demo/hulusi.mp3', 458752, 1),
(10, '曲笛(qudi)', 1, 2, '昆曲伴奏主笛，F调，音色醇厚，江南丝竹之首', '/demo/qudi_f.mp3', 1114112, 1),
(11, '梆笛(bangdi)', 1, 2, '北方梆子戏伴奏，G调，音色高亢清脆', '/demo/bangdi_g.mp3', 1048576, 1),
(12, '陶笛(taodi)', 1, 5, '陶制闭管气鸣，小巧便携，音色纯朴古雅', '/demo/taodi.mp3', 393216, 1),
(13, '尺八(chiba)', 1, 2, '唐代传入日本的竹制竖吹，音色苍凉阔远', '/demo/chiba.mp3', 917504, 1),
(14, '筚篥(bili)', 1, 4, '唐代龟兹传入的簧管，音色悲凉激越', '/demo/bili.mp3', 655360, 1),
(15, '唎咧(lilie)', 1, 4, '小型双簧吹奏，音色尖锐，常用于北方鼓吹乐', '/demo/lilie.mp3', 524288, 1),
(16, '侗笛(dongdi)', 1, 2, '侗族特有竖吹，音色甜美婉转，情歌对唱常用', '/demo/dongdi.mp3', 458752, 1),
(17, '芒筒(mangtong)', 1, 5, '苗族低音簧管，形似巨型芦笙，音色浑厚低沉', '/demo/mangtong.mp3', 851968, 1),

-- 弹拨乐器 (18种)
(18, '古筝(guzheng)', 2, 3, '二十一弦筝，音域宽广，表现力极强，国乐之首', '/demo/guzheng_d.mp3', 2621440, 1),
(19, '琵琶(pipa)', 2, 3, '四弦曲项琵琶，文武曲皆长，"大珠小珠落玉盘"', '/demo/pipa_a.mp3', 1572864, 1),
(20, '三弦(sanxian)', 2, 5, '三根弦无品弹拨，音色浑厚有力，北方曲艺伴奏核心', '/demo/sanxian.mp3', 917504, 1),
(21, '阮(ruan)', 2, 3, '四弦圆形音箱，音色圆润饱满，有"中国的吉他"之称', '/demo/ruan_g.mp3', 1114112, 1),
(22, '扬琴(yangqin)', 2, 1, '击弦乐器，音色清脆明亮，江南丝竹中不可或缺', '/demo/yangqin.mp3', 1245184, 1),
(23, '古琴(guqin)', 2, 2, '七弦文士乐器，三千年前礼乐之源，音色深沉悠远', '/demo/guqin.mp3', 1835008, 1),
(24, '月琴(yueqin)', 2, 3, '四弦圆形弹拨，音色清脆圆润，京剧三大件之一', '/demo/yueqin.mp3', 786432, 1),
(25, '双清(shuangqing)', 2, 3, '双弦弹拨，音色清亮，常用于江南丝竹', '/demo/shuangqing.mp3', 655360, 1),
(26, '伽倻琴(jiayeqin)', 2, 3, '朝鲜族十二弦弹拨，音色清雅婉转', '/demo/jiayeqin.mp3', 983040, 1),
(27, '冬不拉(dongbula)', 2, 5, '哈萨克族二弦弹拨，音色活泼轻快', '/demo/dongbula.mp3', 786432, 1),
(28, '热瓦甫(rewapu)', 2, 5, '维吾尔族五弦弹拨，音色热烈奔放', '/demo/rewapu.mp3', 851968, 1),
(29, '箜篌(konghou)', 2, 2, '竖琴式多弦弹拨，古代宫廷乐器，音色空灵华美', '/demo/konghou.mp3', 2097152, 1),
(30, '秦琴(qinqin)', 2, 3, '三弦弹拨，音色清亮，粤剧伴奏重器', '/demo/qinqin.mp3', 720896, 1),
(31, '中阮(zhongruan)', 2, 3, '次中音阮，音色柔和饱满，民族管弦乐团中声部骨干', '/demo/zhongruan_d.mp3', 1179648, 1),
(32, '大阮(daruan)', 2, 5, '低音阮，音色深沉有力，民族乐队低音基础', '/demo/daruan.mp3', 1310720, 1),
(33, '柳琴(liuqin)', 2, 3, '小型四弦弹拨，形似小琵琶，音色尖锐明亮', '/demo/liuqin.mp3', 786432, 1),
(34, '独弦琴(duxianqin)', 2, 2, '京族独弦泛音弹拨，一弦奏万音，神奇梦幻', '/demo/duxianqin.mp3', 589824, 1),
(35, '瑟(se)', 2, 2, '二十五弦大型弹拨，先秦雅乐核心，音色庄重肃穆', '/demo/se_c.mp3', 2359296, 1),

-- 打击乐器 (13种)
(36, '编钟(bianzhong)', 3, 1, '青铜礼乐器，曾侯乙墓出土，音域跨五个八度，国之重器', '/demo/bianzhong.mp3', 3145728, 1),
(37, '云锣(yunluo)', 3, 1, '十面小锣编组，音色清亮，寺庙道观与宫廷雅乐常见', '/demo/yunluo.mp3', 720896, 1),
(38, '大鼓(gu)', 3, 4, '大型膜鸣乐器，气势磅礴，振奋人心', '/demo/dagu.mp3', 1572864, 1),
(39, '建鼓(jiangu)', 3, 4, '古代仪仗大鼓，用于军队/祭祀，庄重威武', '/demo/jiangu.mp3', 1310720, 1),
(40, '排鼓(paigu)', 3, 4, '五至七个大小不一的鼓编组，可奏旋律的打击乐', '/demo/paigu.mp3', 1835008, 1),
(41, '编磬(bianqing)', 3, 1, '石制打击乐器，孔子击磬于卫，声如金石玉振', '/demo/bianqing.mp3', 1179648, 1),
(42, '铙钹(naobo)', 3, 1, '铜制圆盘对击，音色响亮，常用于戏曲武场', '/demo/naobo.mp3', 393216, 1),
(43, '木鱼(muyu)', 3, 2, '木制敲击，节奏清晰，诵经与乐队节拍器', '/demo/muyu.mp3', 262144, 1),
(44, '板鼓(bangu)', 3, 2, '单皮小鼓，戏曲武场的指挥乐器', '/demo/bangu.mp3', 327680, 1),
(45, '堂鼓(tanggu)', 3, 4, '中型扁鼓，音色柔和，民间吹打乐常用', '/demo/tanggu.mp3', 917504, 1),
(46, '锣(luo)', 3, 1, '大铜锣，合奏起止信号，一声定乾坤', '/demo/luo.mp3', 524288, 1),
(47, '云板(yunban)', 3, 1, '铜制敲击乐器，声音清脆，戏曲打板定节奏', '/demo/yunban.mp3', 262144, 1),
(48, '拍板(paiban)', 3, 2, '数片木板串成，节拍控制工具，说唱与戏曲必备', '/demo/paiban.mp3', 196608, 1),

-- 拉弦乐器 (10种)
(49, '二胡(erhu)', 4, 4, '两根弦的王者，音色接近人声，能奏出万般情感', '/demo/erhu_d.mp3', 1507328, 1),
(50, '京胡(jinghu)', 4, 4, '京剧主奏拉弦，音色尖锐嘹亮，穿透力极强', '/demo/jinghu.mp3', 983040, 1),
(51, '高胡(gaohu)', 4, 3, '高音二胡，音色清亮华丽，广东音乐领奏', '/demo/gaohu.mp3', 1048576, 1),
(52, '板胡(banhu)', 4, 4, '梆子戏主奏，音色高亢激昂，北方戏曲灵魂', '/demo/banhu.mp3', 851968, 1),
(53, '京二胡(jingerhu)', 4, 4, '中音二胡，京剧青衣唱腔伴奏核心，音色柔美', '/demo/jingerhu.mp3', 917504, 1),
(54, '中胡(zhonghu)', 4, 4, '中音胡琴，民族管弦乐团中声部支柱', '/demo/zhonghu.mp3', 1048576, 1),
(55, '马头琴(matouqin)', 4, 5, '蒙古族二弦拉弦，琴头雕刻马头，音色深沉辽阔', '/demo/matouqin.mp3', 1310720, 1),
(56, '椰胡(yehu)', 4, 3, '椰子壳做琴筒，音色醇厚，广东/潮州音乐常用', '/demo/yehu.mp3', 786432, 1),
(57, '坠胡(zhuihu)', 4, 5, '河南坠子、山东琴书主奏，音色浑厚响亮', '/demo/zhuihu.mp3', 851968, 1),
(58, '奚琴(xiqin)', 4, 4, '朝鲜族拉弦乐器，音色哀婉，高丽古乐遗韵', '/demo/xiqin.mp3', 917504, 1);

-- ==================== 标签种子 ====================

INSERT OR IGNORE INTO tags (id, name, category) VALUES
(1, '独奏', 'general'),
(2, '合奏', 'general'),
(3, '激昂', 'mood'),
(4, '忧伤', 'mood'),
(5, '欢快', 'mood'),
(6, '庄严', 'mood'),
(7, '古代', 'era'),
(8, '近现代', 'era'),
(9, '戏曲', 'instrument'),
(10, '宫廷', 'era'),
(11, '民间', 'era'),
(12, '民歌', 'general'),
(13, '京胡', 'instrument'),
(14, '曲笛', 'instrument'),
(15, '高胡', 'instrument'),
(16, '琴', 'instrument'),
(17, '筝', 'instrument'),
(18, '打击', 'instrument'),
(19, '板鼓', 'instrument'),
(20, '五声', 'general');

-- 音源标签关联
INSERT OR IGNORE INTO instrument_tags (instrument_id, tag_id) VALUES
(1,1),(1,20),(2,4),(2,1),(3,3),(3,4),(4,2),(5,3),
(6,4),(6,7),(7,1),(8,4),(9,5),(10,9),(10,14),(11,3),
(12,1),(13,4),(13,7),(14,3),(15,3),(16,5),(17,2),
(18,1),(18,17),(19,1),(19,9),(20,11),(21,2),(22,2),(22,1),
(23,1),(23,16),(24,9),(24,13),(25,2),(26,5),(27,5),(28,3),
(29,7),(29,10),(30,9),(30,15),(31,2),(32,2),(33,1),(34,1),
(35,7),(35,10),(36,2),(36,10),(37,1),(37,10),(38,3),(38,18),
(39,7),(39,10),(40,3),(40,18),(41,7),(41,10),(42,3),(42,18),(42,9),
(43,2),(44,9),(44,19),(45,2),(46,6),(47,9),(48,9),
(49,1),(49,4),(49,3),(50,9),(50,13),(51,9),(51,15),(52,9),(52,3),
(53,9),(53,13),(54,2),(55,4),(55,5),(56,9),(57,11),(58,4);

-- ==================== 模板种子 ====================

-- 二十四节气模板
INSERT OR IGNORE INTO templates (id, name, description, type, subtype, bpm, key_signature, scale_type, genre, element_id, config_json, tags_json) VALUES
(1, '立春·万物复苏',  '清新活泼，笛子+古筝+木鱼',       'solar_term', '立春', 96,  'C', 'pentatonic', 'guofeng', 2,
   '{"tracks":[{"name":"笛子主奏","inst":"dizi","vol":0.8},{"name":"古筝伴奏","inst":"guzheng","vol":0.6},{"name":"木鱼节拍","inst":"muyu","vol":0.3}]}',
   '[1,2,20]'),
(2, '雨水·天街小雨',  '柔和朦胧，箫+琵琶+扬琴',         'solar_term', '雨水', 72,  'D', 'pentatonic', 'guofeng', 3,
   '{"tracks":[{"name":"洞箫低吟","inst":"xiao","vol":0.7},{"name":"琵琶点珠","inst":"pipa","vol":0.5},{"name":"扬琴润色","inst":"yangqin","vol":0.4}]}',
   '[1,2,4,20]'),
(3, '惊蛰·春雷初响',  '热烈激昂，鼓+唢呐+笙',           'solar_term', '惊蛰', 120, 'A', 'pentatonic', 'guofeng', 4,
   '{"tracks":[{"name":"大鼓春雷","inst":"gu","vol":0.9},{"name":"唢呐惊鸟","inst":"suona","vol":0.7},{"name":"笙管和鸣","inst":"sheng","vol":0.5}]}',
   '[1,3,20]'),
(4, '春分·昼夜平分',  '平衡和谐，古琴+编钟+笛子',       'solar_term', '春分', 80,  'C', 'pentatonic', 'guofeng', 2,
   '{"tracks":[{"name":"古琴中正","inst":"guqin","vol":0.7},{"name":"编钟和鸣","inst":"bianzhong","vol":0.5},{"name":"笛子点缀","inst":"dizi","vol":0.4}]}',
   '[1,2,16,17]'),
(5, '清明·烟雨江南',  '忧伤婉转，二胡+箫+古筝',         'solar_term', '清明', 66,  'D', 'pentatonic', 'guofeng', 3,
   '{"tracks":[{"name":"二胡哀思","inst":"erhu","vol":0.8},{"name":"洞箫长叹","inst":"xiao","vol":0.6},{"name":"古筝涟漪","inst":"guzheng","vol":0.5}]}',
   '[1,4,20]'),
(6, '谷雨·播种希望',  '明快轻松，扬琴+笛子+琵琶',       'solar_term', '谷雨', 88,  'G', 'pentatonic', 'guofeng', 3,
   '{"tracks":[{"name":"扬琴轻快","inst":"yangqin","vol":0.8},{"name":"笛子悠扬","inst":"dizi","vol":0.6},{"name":"琵琶点缀","inst":"pipa","vol":0.4}]}',
   '[1,2,5,20]'),
(7, '立夏·烈日当空',  '热情奔放，鼓+唢呐+笙+琵琶',     'solar_term', '立夏', 132, 'G', 'pentatonic', 'guofeng', 4,
   '{"tracks":[{"name":"战鼓擂动","inst":"gu","vol":0.9},{"name":"唢呐高歌","inst":"suona","vol":0.8},{"name":"笙管齐鸣","inst":"sheng","vol":0.6},{"name":"琵琶急弹","inst":"pipa","vol":0.5}]}',
   '[1,3,20]'),
(8, '小满·麦浪滚滚',  '充实饱满，古筝+阮+木鱼',         'solar_term', '小满', 84,  'D', 'pentatonic', 'guofeng', 2,
   '{"tracks":[{"name":"古筝主调","inst":"guzheng","vol":0.7},{"name":"中阮衬托","inst":"zhongruan","vol":0.5},{"name":"木鱼节奏","inst":"muyu","vol":0.3}]}',
   '[1,2,5,20]'),
(9, '芒种·抢收时节',  '紧张活泼，琵琶+笛子+板鼓',       'solar_term', '芒种', 116, 'A', 'pentatonic', 'guofeng', 4,
   '{"tracks":[{"name":"琵琶急奏","inst":"pipa","vol":0.8},{"name":"梆笛助奏","inst":"bangdi","vol":0.6},{"name":"板鼓催急","inst":"bangu","vol":0.5}]}',
   '[1,3,20]'),
(10, '夏至·最长白昼', '悠长舒展，箫+古琴+编磬',         'solar_term', '夏至', 60,  'C', 'pentatonic', 'guofeng', 3,
   '{"tracks":[{"name":"洞箫悠长","inst":"xiao","vol":0.8},{"name":"古琴衬托","inst":"guqin","vol":0.5},{"name":"编磬尾韵","inst":"bianqing","vol":0.3}]}',
   '[1,2,4,20]'),
(11, '小暑·蝉鸣阵阵', '燥热不安，唢呐+鼓+京胡',         'solar_term', '小暑', 110, 'F', 'pentatonic', 'guofeng', 4,
   '{"tracks":[{"name":"唢呐蝉鸣","inst":"suona","vol":0.8},{"name":"鼓点密集","inst":"gu","vol":0.6},{"name":"京胡穿透","inst":"jinghu","vol":0.5}]}',
   '[1,3,9,20]'),
(12, '大暑·骄阳似火', '极度炙热，打击+唢呐+管子',       'solar_term', '大暑', 140, 'A', 'pentatonic', 'guofeng', 4,
   '{"tracks":[{"name":"排鼓烈日","inst":"paigu","vol":0.9},{"name":"唢呐呼啸","inst":"suona","vol":0.8},{"name":"管子嘶鸣","inst":"guanzi","vol":0.6}]}',
   '[1,3,18,20]'),
(13, '立秋·秋风乍起', '清爽明净，笛子+扬琴+古筝',       'solar_term', '立秋', 78,  'C', 'pentatonic', 'guofeng', 2,
   '{"tracks":[{"name":"笛子清风","inst":"dizi","vol":0.7},{"name":"扬琴点秋","inst":"yangqin","vol":0.5},{"name":"古筝余韵","inst":"guzheng","vol":0.4}]}',
   '[1,2,20]'),
(14, '处暑·暑气消散', '渐趋宁静，萧+琵琶+古琴',         'solar_term', '处暑', 68,  'D', 'pentatonic', 'guofeng', 3,
   '{"tracks":[{"name":"洞箫舒缓","inst":"xiao","vol":0.7},{"name":"琵琶轻拨","inst":"pipa","vol":0.5},{"name":"古琴衬底","inst":"guqin","vol":0.4}]}',
   '[1,2,4,20]'),
(15, '白露·秋月无边', '清冷雅致，古琴+箫+编磬',         'solar_term', '白露', 60,  'D', 'pentatonic', 'guofeng', 3,
   '{"tracks":[{"name":"古琴主奏","inst":"guqin","vol":0.8},{"name":"洞箫和声","inst":"xiao","vol":0.5},{"name":"编磬点缀","inst":"bianqing","vol":0.3}]}',
   '[1,2,16]'),
(16, '秋分·月圆人圆', '团圆温馨，编钟+古筝+笛子+笙',   'solar_term', '秋分', 72,  'C', 'pentatonic', 'guofeng', 3,
   '{"tracks":[{"name":"编钟合鸣","inst":"bianzhong","vol":0.7},{"name":"古筝主调","inst":"guzheng","vol":0.7},{"name":"笛子悠扬","inst":"dizi","vol":0.5},{"name":"笙管和声","inst":"sheng","vol":0.4}]}',
   '[1,2,17,5,20]'),
(17, '寒露·秋风萧瑟', '凄凉忧伤，二胡+埙+琵琶',         'solar_term', '寒露', 60,  'D', 'pentatonic', 'guofeng', 4,
   '{"tracks":[{"name":"二胡悲秋","inst":"erhu","vol":0.8},{"name":"埙声萧瑟","inst":"xun","vol":0.5},{"name":"琵琶点缀","inst":"pipa","vol":0.4}]}',
   '[1,4,20]'),
(18, '霜降·凛冬将至',  '严峻悲壮，鼓+唢呐+二胡',       'solar_term', '霜降', 104, 'E', 'pentatonic', 'guofeng', 4,
   '{"tracks":[{"name":"战鼓序奏","inst":"gu","vol":0.9},{"name":"唢呐哀鸣","inst":"suona","vol":0.7},{"name":"二胡悲歌","inst":"erhu","vol":0.6}]}',
   '[1,3,4,20]'),
(19, '立冬·初雪纷纷',  '宁静冰冷，箫+编磬+古琴',       'solar_term', '立冬', 52,  'C', 'pentatonic', 'guofeng', 1,
   '{"tracks":[{"name":"洞箫寒音","inst":"xiao","vol":0.7},{"name":"编磬清冷","inst":"bianqing","vol":0.3},{"name":"古琴雪意","inst":"guqin","vol":0.4}]}',
   '[1,2,20]'),
(20, '小雪·围炉煮茶',  '温暖舒适，古筝+三弦+木鱼',     'solar_term', '小雪', 72,  'G', 'pentatonic', 'guofeng', 2,
   '{"tracks":[{"name":"古筝暖音","inst":"guzheng","vol":0.7},{"name":"三弦轻拨","inst":"sanxian","vol":0.5},{"name":"木鱼节拍","inst":"muyu","vol":0.3}]}',
   '[1,2,20]'),
(21, '大雪·银装素裹',  '壮阔辽远，编钟+鼓+笛子',       'solar_term', '大雪', 80,  'F', 'pentatonic', 'guofeng', 1,
   '{"tracks":[{"name":"编钟浑响","inst":"bianzhong","vol":0.8},{"name":"鼓声远传","inst":"gu","vol":0.5},{"name":"笛声悠扬","inst":"dizi","vol":0.4}]}',
   '[1,2,20]'),
(22, '冬至·长夜漫漫',  '深沉宁静，埙+古琴+编磬',       'solar_term', '冬至', 48,  'D', 'pentatonic', 'guofeng', 1,
   '{"tracks":[{"name":"埙声低沉","inst":"xun","vol":0.8},{"name":"古琴衬托","inst":"guqin","vol":0.5},{"name":"编磬尾音","inst":"bianqing","vol":0.2}]}',
   '[1,2,4,20]'),
(23, '小寒·冰封万里',  '冷峻坚韧，二胡+鼓+琵琶',       'solar_term', '小寒', 96,  'A', 'pentatonic', 'guofeng', 4,
   '{"tracks":[{"name":"二胡凛风","inst":"erhu","vol":0.8},{"name":"鼓点坚定","inst":"gu","vol":0.6},{"name":"琵琶急拨","inst":"pipa","vol":0.5}]}',
   '[1,3,20]'),
(24, '大寒·辞旧迎新',  '庄严隆重，编钟+鼓+唢呐+笙',    'solar_term', '大寒', 120, 'C', 'pentatonic', 'guofeng', 4,
   '{"tracks":[{"name":"编钟大典","inst":"bianzhong","vol":0.9},{"name":"典礼大鼓","inst":"gu","vol":0.8},{"name":"唢呐庆典","inst":"suona","vol":0.7},{"name":"笙管齐鸣","inst":"sheng","vol":0.6}]}',
   '[1,3,20]');

-- 戏曲配器模板
INSERT OR IGNORE INTO templates (id, name, description, type, subtype, bpm, key_signature, scale_type, genre, element_id, config_json, tags_json) VALUES
(25, '京剧·青衣唱段',   '京剧青角伴奏：京胡+京二胡+月琴+板鼓+大锣', 'genre', '京剧', 88, 'F', 'pentatonic', 'jingju', 4,
   '{"tracks":[{"name":"京胡主奏","inst":"jinghu","vol":0.9},{"name":"京二胡","inst":"jingerhu","vol":0.6},{"name":"月琴节奏","inst":"yueqin","vol":0.5},{"name":"板鼓节拍","inst":"bangu","vol":0.7},{"name":"大锣","inst":"daluo","vol":0.3}],"patterns":["西皮","二黄"]}',
   '[1,13,19]'),
(26, '昆曲·水磨腔',     '昆曲水磨腔伴奏：曲笛+笙+琵琶+鼓板',      'genre', '昆曲', 64, 'D', 'pentatonic', 'kunqu', 3,
   '{"tracks":[{"name":"曲笛主旋律","inst":"qudi","vol":0.8},{"name":"笙管和声","inst":"sheng","vol":0.5},{"name":"琵琶伴奏","inst":"pipa","vol":0.4},{"name":"鼓板节奏","inst":"guban","vol":0.3}]}',
   '[1,14,2]'),
(27, '粤剧·梆黄腔',     '粤剧伴奏：高胡+扬琴+秦琴+中阮+大提琴',    'genre', '粤剧', 100, 'G', 'pentatonic', 'yueju', 3,
   '{"tracks":[{"name":"高胡主奏","inst":"gaohu","vol":0.8},{"name":"扬琴和声","inst":"yangqin","vol":0.6},{"name":"秦琴助奏","inst":"qinqin","vol":0.5},{"name":"中阮低音","inst":"zhongruan","vol":0.4},{"name":"大提琴低音","inst":"cello","vol":0.3}]}',
   '[1,15,8]');

-- 演示编曲工程
INSERT OR IGNORE INTO project_folders (id, parent_id, name, description, sort_order, element_id) VALUES
(1, 0, '我的编曲工程',  '所有编曲工程根目录', 1, 2),
(2, 1, '古风专辑·山河万里', '第一张古风编曲专辑', 1, 2),
(3, 1, '戏曲配器项目',    '戏曲伴奏编曲工程', 2, 2),
(4, 0, '节气模板工程',    '二十四节气模板复制工程', 2, 2);

INSERT OR IGNORE INTO projects (id, folder_id, name, description, bpm, time_signature, key_signature, scale_type, genre, status, duration, element_id, tags_json) VALUES
(1, 2, '山河入梦·序曲',   '古风专辑开篇曲，编钟+古琴+笛子',     76,  '4/4', 'C', 'pentatonic', 'guofeng', 'mixing', 245, 3, '[1,9,11]'),
(2, 2, '关山月·边塞行',   '边塞主题，唢呐+鼓+琵琶+二胡',        128, '4/4', 'A', 'pentatonic', 'guofeng', 'recording', 198, 4, '[1,3,9]'),
(3, 2, '江南雨·烟波画',   '江南水乡，箫+古筝+笛子',            72,  '3/4', 'D', 'pentatonic', 'guofeng', 'draft', 312, 3, '[1,2,4]'),
(4, 3, '京剧·贵妃醉酒伴奏', '京剧经典唱段伴奏编曲',           88,  '2/4', 'F', 'pentatonic', 'jingju', 'mastered', 420, 4, '[13,3,9]'),
(5, 4, '立春·万物复苏(自定义)', '基于立春模板改编的个人版本',   96,  '4/4', 'C', 'pentatonic', 'guofeng', 'draft', 180, 2, '[20,1,2]');

-- 演示轨道（instrument_id 已更新匹配新种子数据）
INSERT OR IGNORE INTO tracks (id, project_id, name, track_type, instrument_id, volume, pan, color, sort_order, height) VALUES
(1, 1, '编钟·序奏',   'audio', 36, 0.7, 0.5, '#c9a84c', 1, 80),
(2, 1, '古琴·主旋律', 'audio', 18, 0.8, 0.5, '#4a7c59', 2, 100),
(3, 1, '笛子·副旋律', 'audio', 1,  0.6, 0.4, '#4a7eb5', 3, 80),
(4, 1, '鼓·节奏',     'audio', 38, 0.5, 0.5, '#c43c2c', 4, 60),
(5, 1, 'MIDI·五声旋律','midi', 0,  0.0, 0.5, '#8b6b4a', 5, 90),
(6, 2, '唢呐·主旋律', 'audio', 5,  0.9, 0.5, '#c43c2c', 1, 100),
(7, 2, '战鼓·基底',   'audio', 39, 0.8, 0.5, '#c9a84c', 2, 80),
(8, 2, '琵琶·节奏',   'audio', 20, 0.6, 0.6, '#4a7c59', 3, 80),
(9, 2, '二胡·和声',   'audio', 49, 0.5, 0.4, '#4a7eb5', 4, 80),
(10, 1, '主输出',     'master', 0,  1.0, 0.5, '#ffffff', 99, 50);

-- 演示轨道片段
INSERT OR IGNORE INTO track_clips (id, track_id, name, clip_type, start_time, end_time, offset, gain, fade_in, fade_out) VALUES
(1, 1, '编钟前奏', 'audio', 0, 16, 0, 1.0, 0.5, 1.0),
(2, 2, '古琴A段',  'audio', 4, 80, 2, 0.9, 0.2, 0.3),
(3, 3, '笛子B段',  'audio', 40, 120, 0, 0.8, 0.3, 0.5),
(4, 4, '鼓组循环', 'audio', 0, 245, 0, 1.0, 0, 0),
(5, 5, '五声旋律', 'midi', 8, 160, 0, 1.0, 0.1, 0.2);

-- 混音预设
INSERT OR IGNORE INTO mix_presets (id, name, description, category, config_json, is_builtin, element_id) VALUES
(1, '古风·清雅',  '适合古琴/笛子等清雅乐器', 'builtin', '{"reverb":"hall","reverb_wet":0.4,"delay_time":0.3,"delay_feedback":0.2,"eq":{"low":0,"mid":2,"high":1},"compressor":{"threshold":-18,"ratio":3}}', 1, 3),
(2, '戏曲·激昂',  '适合京剧/昆曲等戏曲配器', 'builtin', '{"reverb":"room","reverb_wet":0.25,"delay_time":0.15,"delay_feedback":0.1,"eq":{"low":3,"mid":0,"high":-2},"compressor":{"threshold":-12,"ratio":4}}', 1, 4),
(3, '民乐·融合',  '现代民乐融合风格', 'builtin', '{"reverb":"plate","reverb_wet":0.35,"delay_time":0.25,"delay_feedback":0.15,"eq":{"low":1,"mid":1,"high":2},"compressor":{"threshold":-15,"ratio":3.5}}', 1, 1),
(4, '打击·震撼',  '大型打击乐场预设', 'builtin', '{"reverb":"cathedral","reverb_wet":0.5,"delay_time":0.4,"delay_feedback":0.3,"eq":{"low":5,"mid":-1,"high":0},"compressor":{"threshold":-10,"ratio":6},"limiter":{"threshold":-3}}', 1, 4);

-- 演示版权记录
INSERT OR IGNORE INTO copyrights (id, project_id, title, author, registration_no, work_type, status, description) VALUES
(1, 1, '山河入梦·序曲',     '赵攀宇', 'ELM-2026-00001', 'arrangement', 'certified', '古风编曲作品，编钟+古琴+笛子配器编排'),
(2, 2, '关山月·边塞行',     '赵攀宇', 'ELM-2026-00002', 'arrangement', 'submitted',  '边塞主题古风编曲，唢呐主奏+打击乐'),
(3, 4, '贵妃醉酒伴奏编曲',  '赵攀宇', '',                 'arrangement', 'draft',      '京剧经典唱段配器编曲');

-- 系统设置
INSERT OR IGNORE INTO app_settings (key, value_json, description) VALUES
('audio_engine',  '{"sample_rate":44100,"buffer_size":2048,"driver":"webaudio"}', '音频引擎配置'),
('ui_theme',       '{"element":"water","particle_density":50,"animation_speed":1.0}', 'UI主题设置'),
('file_storage',   '{"max_file_size":536870912,"allowed_formats":["mp3","wav","flac","ogg","mid","midi","json","css","png","jpg","svg","txt"],"auto_backup":true}', '文件存储配置'),
('recent_projects', '[]', '最近打开的工程'),
('version',         '"1.0.0"', '平台版本号');
`;
