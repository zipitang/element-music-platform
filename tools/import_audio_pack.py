# -*- coding: utf-8 -*-
"""
03-乐器音效 素材包导入脚本（可重复执行，幂等）

做两件事：
1) 绑定：给平台已有的 58 条民乐音源，按名称匹配素材包里最接近的乐器目录，
   每条形源挑 1 个代表样本，拷进 server/public/uploads/instruments/ 并写回 file_path。
2) 补录：素材包里还有一批平台没有对应音源的乐器（钢琴/吉他/爵士鼓/电子乐…），
   每类挑 1 个代表样本，作为新音源插入 instruments 表（分类/五行自动推断）。

用法：
    python tools/import_audio_pack.py --dry-run     # 只打印计划，不落盘
    python tools/import_audio_pack.py               # 执行
    python tools/import_audio_pack.py --all-samples # 每类导入最多 5 个样本（更丰富的曲库）

依赖：仅标准库。
"""
import argparse
import hashlib
import os
import re
import shutil
import sqlite3
import sys

# ============ 路径 ============
PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(PROJECT, "data", "element-music.db")
UPLOAD_DIR = os.path.join(PROJECT, "server", "public", "uploads", "instruments")
PACK_DIR = os.path.join(os.path.dirname(PROJECT), "assets", "rar_extract", "第五部分 乐器音效")

# ============ 数据库乐器 -> 素材包目录 ============
# key 为音源名「·」前的乐器前缀，value 为素材包目录名
PREFIX_TO_FOLDER = {
    # 吹管
    "笛子": "笛子", "梆笛": "笛子", "箫": "笛子", "琴箫": "笛子", "巴乌": "笛子",
    "葫芦丝": "笛子", "排箫": "笛子", "口笛": "笛子", "尺八": "笛子",
    "唢呐": "双簧管", "中音唢呐": "双簧管", "低音唢呐": "低音管", "管子": "双簧管",
    "笙": "口琴", "键笙": "口琴", "芦笙": "口琴", "埙": "低音管",
    # 弹拨
    "古琴": "古乐", "琵琶": "琵琶",
    "古筝": "竖琴", "箜篌": "竖琴", "瑟": "竖琴", "独弦琴": "竖琴",
    "中阮": "吉他", "大阮": "吉他", "小阮": "吉他", "柳琴": "吉他",
    "月琴": "吉他", "秦琴": "吉他",
    "三弦": "班卓琴", "小三弦": "班卓琴", "扬琴": "木琴",
    # 打击
    "编钟": "清脆编钟声", "编磬": "清脆编钟声",
    "大堂鼓": "大鼓", "战鼓": "大鼓", "排鼓": "大鼓",
    "锣": "铜锣", "云锣": "铜锣", "钹": "铜锣",
    "木鱼": "鼓声", "梆子": "鼓声", "碰铃": "飞铃", "板鼓": "鼓", "渔鼓": "手鼓",
    # 拉弦
    "二胡": "二胡", "京胡": "二胡", "板胡": "二胡", "高胡": "二胡",
    "中胡": "二胡", "坠胡": "二胡", "奚琴": "二胡",
    "马头琴": "大提琴", "革胡": "大提琴",
}

# 素材包目录 -> 分类（1吹管 2弹拨 3打击 4拉弦 5电子与音效）
FOLDER_CATEGORY = {
    "低音管": 1, "单簧管": 1, "双簧管": 1, "口琴": 1, "萨克司": 1, "管风琴": 1,
    "风琴": 1, "大键架": 1, "迪吉里杜管": 1, "小号音符": 1,
    "克林巴琴": 2, "六弦琴": 2, "吉他": 2, "吉他音符": 2, "安比拉琴": 2,
    "拨铃波琴": 2, "班卓琴": 2, "琵琶": 2, "竖琴": 2, "钢琴": 2, "贝司": 2,
    "锡塔尔琴": 2, "电子琴音符": 2,
    "三角器": 3, "响葫芦": 3, "大鼓": 3, "定音鼓": 3, "手鼓": 3, "木琴": 3,
    "清脆编钟声": 3, "爵士鼓": 3, "爵士鼓中的锣声": 3, "爵士鼓音符": 3,
    "电子爵士鼓": 3, "蒂姆巴尔鼓": 3, "铁琴": 3, "铜锣": 3, "飞铃": 3,
    "鼓": 3, "鼓声": 3, "拉索": 3, "电颤琴": 3, "拍手音符": 3,
    "二胡": 4, "小提琴": 4, "大提琴": 4, "弦乐音符": 4, "锯琴": 4,
    "电子乐": 5, "人声音效": 5, "混合音效": 5, "单音": 5, "活泼的乐器": 5, "管弦乐": 5,
    "精彩乐器": 5, "电锯声+敲打": 5, "古乐": 5,
}

# 素材包目录 -> 五行（1金 2木 3水 4火 5土）
METAL = {"铜锣", "清脆编钟声", "飞铃", "三角器", "爵士鼓中的锣声", "铁琴"}
WIND_WOOD = {"笛子", "单簧管", "双簧管", "低音管", "口琴", "萨克司", "管风琴", "风琴",
             "大键架", "迪吉里杜管", "琵琶", "吉他", "六弦琴", "班卓琴", "竖琴", "钢琴",
             "克林巴琴", "安比拉琴", "拨铃波琴", "锡塔尔琴", "木琴"}
WATER = {"二胡", "小提琴", "大提琴", "弦乐音符", "锯琴", "人声音效", "贝司", "古乐", "管弦乐",
         "电子琴音符", "吉他音符", "单音"}
FIRE = {"电子乐", "电子爵士鼓", "混合音效", "精彩乐器", "活泼的乐器", "电锯声+敲打"}


def guess_element(folder: str) -> int:
    if folder in METAL:
        return 1
    if folder in WIND_WOOD:
        return 2
    if folder in WATER:
        return 3
    if folder in FIRE:
        return 4
    return 5  # 鼓类等归土


# ============ MP3 时长解析（不依赖第三方库）============
BITRATE_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
BITRATE_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
SAMPLE_RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def mp3_duration(path: str) -> float:
    """CBR/VBR 近似时长（秒）。解析失败返回 0。"""
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            head = f.read(200 * 1024)
        i = 0
        if head[:3] == b"ID3" and len(head) > 10:
            tag_size = ((head[6] & 0x7F) << 21) | ((head[7] & 0x7F) << 14) | \
                       ((head[8] & 0x7F) << 7) | (head[9] & 0x7F)
            i = 10 + tag_size
        while i < len(head) - 4:
            if head[i] == 0xFF and (head[i + 1] & 0xE0) == 0xE0:
                h = head[i:i + 4]
                version = (h[1] >> 3) & 0x03   # 3=MPEG1 2=MPEG2 0=MPEG2.5
                layer = (h[1] >> 1) & 0x03     # 1=Layer3
                br_idx = (h[2] >> 4) & 0x0F
                sr_idx = (h[2] >> 2) & 0x03
                if layer != 1 or br_idx in (0, 15) or sr_idx == 3:
                    i += 1
                    continue
                table = BITRATE_V1_L3 if version == 3 else BITRATE_V2_L3
                bitrate = table[br_idx] * 1000
                sr = SAMPLE_RATES.get(version, [44100, 48000, 32000])[sr_idx]
                if bitrate <= 0 or sr <= 0:
                    i += 1
                    continue
                # 尝试 Xing/Info 帧数
                frame_len = int(144 * bitrate / sr) if version == 3 else int(72 * bitrate / sr)
                xing = head[i:i + min(frame_len, 128)]
                if b"Xing" in xing or b"Info" in xing:
                    m = re.search(rb"(?:Xing|Info).{0,8}", xing, re.S)
                    if m:
                        idx = xing.find(m.group(0)) + len(m.group(0))
                        flags = int.from_bytes(xing[idx:idx + 4], "big")
                        if flags & 0x1:
                            frames = int.from_bytes(xing[idx + 4:idx + 8], "big")
                            spf = 1152 if version == 3 else 576
                            return round(frames * spf / sr, 1)
                return round(max(0, size - i) * 8 / bitrate, 1)
            i += 1
        return 0.0
    except Exception:
        return 0.0


# ============ 样本挑选 ============
AUDIO_EXT = (".mp3", ".wav")


def looks_like_audio(path: str) -> bool:
    """素材包里有少量坏文件（如 贝司/16.mp3 其实是无效数据），先做头部校验再入选"""
    try:
        with open(path, "rb") as f:
            head = f.read(4096)
        if len(head) < 4:
            return False
        if head[:3] == b"ID3" or head[:4] == b"RIFF":
            return True
        # 严格只看开头：MPEG 帧同步必须出现在文件起始（0xFF 0xEx / 0xFx）
        return head[0] == 0xFF and (head[1] & 0xE0) == 0xE0
    except Exception:
        return False


def list_audio(folder: str):
    """递归收集目录下的音频（素材包里有 鼓/Build_Ups 这类嵌套子目录，且部分只有 WAV）"""
    d = os.path.join(PACK_DIR, folder)
    if not os.path.isdir(d):
        return []
    files = []
    for root, _dirs, names in os.walk(d):
        for f in names:
            if f.lower().endswith(AUDIO_EXT):
                p = os.path.join(root, f)
                if looks_like_audio(p):
                    files.append(p)
    files.sort(key=lambda p: (len(os.path.basename(p)), os.path.basename(p)))
    return files


def pick_samples(folder: str, count: int = 1, offset: int = 0):
    """挑代表样本：按体积取中位数附近，避免挑到 1KB 的碎片或超长循环；
    offset 用于同一目录被多次绑定时的轮换，让不同音源拿到不同样本。"""
    files = list_audio(folder)
    if not files:
        return []
    sized = [(os.path.getsize(p), p) for p in files]
    sized.sort()
    preferred = [p for s, p in sized if 20 * 1024 <= s <= 1024 * 1024] or [p for s, p in sized]
    n = len(preferred)
    mid = n // 2
    order = preferred[mid:] + preferred[:mid]
    if n == 0:
        return []
    return [order[(offset + k) % n] for k in range(min(count, n))]


def safe_name(folder: str, tag: str, ext: str) -> str:
    h = hashlib.md5(folder.encode("utf-8")).hexdigest()[:8]
    return f"pack-{tag}-{h}{ext}"


def audio_duration(path: str) -> float:
    return wav_duration(path) if path.lower().endswith(".wav") else mp3_duration(path)


def wav_duration(path: str) -> float:
    """解析 RIFF/WAVE 头拿时长（秒）"""
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            head = f.read(256 * 1024)
        if head[:4] != b"RIFF" or head[8:12] != b"WAVE":
            return 0.0
        i = 12
        byte_rate = None
        while i + 8 <= len(head):
            cid = head[i:i + 4]
            sz = int.from_bytes(head[i + 4:i + 8], "little")
            if cid == b"fmt ":
                byte_rate = int.from_bytes(head[i + 16:i + 20], "little")
            elif cid == b"data":
                if not byte_rate:
                    return 0.0
                data_size = min(sz, max(0, size - (i + 8)))
                return round(data_size / byte_rate, 1)
            i += 8 + sz + (sz & 1)
        return 0.0
    except Exception:
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all-samples", action="store_true", help="每类导入最多 5 个样本")
    args = ap.parse_args()

    if not os.path.isdir(PACK_DIR):
        print(f"[ERR] 素材包目录不存在：{PACK_DIR}")
        sys.exit(1)
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # ---------- 1. 绑定已有音源 ----------
    rows = list(cur.execute(
        "SELECT id, name, category_id FROM instruments WHERE is_deleted=0 AND description NOT LIKE '素材包·%' ORDER BY id"
    ))
    bind_plan = []
    used_folders = set()
    folder_use = {}
    for r in rows:
        name = r["name"] or ""
        prefix = name.split("·")[0].strip()
        folder = PREFIX_TO_FOLDER.get(prefix)
        if not folder:
            # 前缀里带修饰（如 中音唢呐）时做包含匹配，取最长的 key 以免误配
            hits = [k for k in PREFIX_TO_FOLDER if k in prefix]
            if hits:
                folder = PREFIX_TO_FOLDER[max(hits, key=len)]
        if not folder or not os.path.isdir(os.path.join(PACK_DIR, folder)):
            continue
        offset = folder_use.get(folder, 0)
        sample = pick_samples(folder, 1, offset)
        if not sample:
            continue
        folder_use[folder] = offset + 1
        bind_plan.append((r["id"], name, folder, sample[0]))
        used_folders.add(folder)

    print(f"== 绑定计划：{len(bind_plan)} 条已有音源 -> 素材包样本")
    for iid, name, folder, path in bind_plan:
        print(f"   [{iid:>2}] {name}  <-  {folder}/{os.path.basename(path)}")

    # ---------- 2. 补录素材包里平台没有的乐器 ----------
    all_folders = [d for d in os.listdir(PACK_DIR) if os.path.isdir(os.path.join(PACK_DIR, d))]
    all_folders.sort()
    extra = [f for f in all_folders if f not in used_folders]

    # 以「非素材包行」的最大 id 作为起点，保证重复执行时补录 id 稳定（59、60…）
    max_id = cur.execute(
        "SELECT COALESCE(MAX(id),0) FROM instruments WHERE description NOT LIKE '素材包·%'"
    ).fetchone()[0]
    insert_plan = []
    per_folder = 5 if args.all_samples else 1
    for folder in extra:
        samples = pick_samples(folder, per_folder)
        if not samples:
            continue
        for idx, path in enumerate(samples):
            max_id += 1
            name = f"{folder}·素材包" if len(samples) == 1 else f"{folder}·素材包{idx + 1}"
            insert_plan.append((max_id, folder, name, path))

    print(f"\n== 补录计划：{len(extra)} 个素材包乐器，共 {len(insert_plan)} 条新音源")
    for iid, folder, name, path in insert_plan:
        print(f"   [{iid:>3}] {name}  <-  {folder}/{os.path.basename(path)}")

    if args.dry_run:
        print("\n[dry-run] 未改动数据库与文件")
        return

    # ---------- 3. 落盘：拷文件 + 写库 ----------
    # 幂等：先清掉上一轮补录的行（绑定行按 id UPDATE，不会重复）
    cur.execute("DELETE FROM instruments WHERE description LIKE '素材包·%'")
    removed = cur.rowcount

    copied = 0
    for iid, name, folder, src in bind_plan:
        ext = os.path.splitext(src)[1].lower()
        dst_name = safe_name(folder, f"ins{iid}", ext)
        dst = os.path.join(UPLOAD_DIR, dst_name)
        shutil.copy2(src, dst)   # 始终覆盖，保证重复执行后内容与素材包一致
        copied += 1
        size = os.path.getsize(dst)
        dur = audio_duration(dst)
        cur.execute(
            """UPDATE instruments
               SET file_path=?, file_size=?, duration=?, format=?, updated_at=datetime('now')
               WHERE id=?""",
            (f"/uploads/instruments/{dst_name}", size, dur, ext.lstrip("."), iid),
        )

    for iid, folder, name, src in insert_plan:
        ext = os.path.splitext(src)[1].lower()
        fmt = ext.lstrip(".")
        dst_name = safe_name(folder, f"new{iid}", ext)
        dst = os.path.join(UPLOAD_DIR, dst_name)
        shutil.copy2(src, dst)
        copied += 1
        size = os.path.getsize(dst)
        dur = audio_duration(dst)
        cur.execute(
            """INSERT INTO instruments
               (id, name, category_id, element_id, description, file_path, file_size, duration,
                sample_rate, bit_depth, channels, format, cover_path, tags_json, metadata_json,
                is_builtin, is_favorite, play_count, rating, created_at, updated_at, is_deleted)
               VALUES (?,?,?,?,?,?,?,?,44100,16,2,?,'','[]','{}',1,0,0,0,datetime('now'),datetime('now'),0)""",
            (iid, name, FOLDER_CATEGORY.get(folder, 3), guess_element(folder),
             f"素材包·03-乐器音效/{folder}/{os.path.basename(src)}",
             f"/uploads/instruments/{dst_name}", size, dur, fmt),
        )

    # 新增「电子与音效」分类（如果补录里用到了 5）
    if any(FOLDER_CATEGORY.get(f[1], 3) == 5 for f in insert_plan):
        cur.execute(
            "INSERT OR IGNORE INTO instrument_categories (id, name, icon, sort_order, description) "
            "VALUES (5,'电子与音效','fx',5,'素材包补充：电子乐、人声与混合音效')"
        )

    conn.commit()
    total_file = cur.execute(
        "SELECT COUNT(*) FROM instruments WHERE is_deleted=0 AND file_path!=''"
    ).fetchone()[0]
    total = cur.execute("SELECT COUNT(*) FROM instruments WHERE is_deleted=0").fetchone()[0]
    conn.close()

    print(f"\n[OK] 清理旧补录 {removed} 条；绑定 {len(bind_plan)} 条；新增 {len(insert_plan)} 条；"
          f"新拷入文件 {copied} 个")
    print(f"[OK] 现在有音频的音源：{total_file}/{total}")
    print(f"[OK] 音频目录：{UPLOAD_DIR}")


if __name__ == "__main__":
    main()
