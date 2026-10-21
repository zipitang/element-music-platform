/**
 * ============================================================
 *  元素音乐编曲管理平台 - 数据库管理器 (sql.js / WASM)
 *  纯JS实现，无需C++编译，支持WAL模式
 * ============================================================
 */
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { SCHEMA_SQL, SEED_SQL } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = resolve(__dirname, '../../data');
const DB_PATH = resolve(DB_DIR, 'element-music.db');

export class DatabaseManager {
  private db: SqlJsDatabase | null = null;
  private static _instance: DatabaseManager;

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager._instance) {
      DatabaseManager._instance = new DatabaseManager();
    }
    return DatabaseManager._instance;
  }

  /** 异步初始化 */
  async init() {
    if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

    const SQL = await initSqlJs();

    // 从文件加载或创建新数据库
    if (existsSync(DB_PATH)) {
      const buf = readFileSync(DB_PATH);
      this.db = new SQL.Database(buf);
    } else {
      this.db = new SQL.Database();
    }

    // 开启WAL模式
    this.getDB().run('PRAGMA journal_mode = WAL');
    this.getDB().run('PRAGMA synchronous = NORMAL');
    this.getDB().run('PRAGMA foreign_keys = OFF');
    this.getDB().run('PRAGMA busy_timeout = 5000');
    this.getDB().run('PRAGMA cache_size = -64000');

    // 创建表结构
    this.getDB().run(SCHEMA_SQL);
    this.getDB().run(SEED_SQL);

    this.saveToFile();
    console.log(`[DB] 数据库已初始化: ${DB_PATH}`);
  }

  /** 持久化到磁盘 */
  saveToFile() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(DB_PATH, buffer);
  }

  /** 定期自动保存 */
  startAutoSave(intervalMs = 30000) {
    setInterval(() => this.saveToFile(), intervalMs);
  }

  /** 获取底层 db 实例 */
  getDB(): SqlJsDatabase {
    if (!this.db) throw new Error('数据库未初始化');
    return this.db;
  }

  // ==================== 通用CRUD ====================

  query<T = any>(table: string, options: {
    where?: string;
    params?: any[];
    orderBy?: string;
    limit?: number;
    offset?: number;
  } = {}): T[] {
    const { where = 'is_deleted = 0', params = [], orderBy = 'created_at DESC', limit = 100, offset = 0 } = options;
    const sql = `SELECT * FROM ${table} WHERE ${where} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
    try {
      const results = this.getDB().exec(sql, params as any[]);
      return results.length > 0 ? this.rowsToObjects(results[0]) : [];
    } catch (e: any) {
      console.error(`[DB] 查询错误: ${sql}`, e.message);
      return [];
    }
  }

  queryOne<T = any>(table: string, id: number): T | undefined {
    try {
      const results = this.getDB().exec(`SELECT * FROM ${table} WHERE id = ${id} AND is_deleted = 0`);
      if (results.length > 0 && results[0].values.length > 0) {
        return this.rowToObject(results[0]);
      }
      return undefined;
    } catch (e: any) {
      console.error(`[DB] 查询错误: ${table} id=${id}`, e.message);
      return undefined;
    }
  }

  count(table: string, where: string = 'is_deleted = 0', params: any[] = []): number {
    try {
      const results = this.getDB().exec(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${where}`, params as any[]);
      if (results.length > 0 && results[0].values.length > 0) {
        return Number(results[0].values[0][0]);
      }
      return 0;
    } catch (e) {
      return 0;
    }
  }

  insert(table: string, data: Record<string, any>): number {
    if (!data.created_at) {
      data.created_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    }
    const keys = Object.keys(data);
    const vals = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    try {
      this.getDB().run(sql, vals as any[]);
      // 获取最后插入的ID
      const result = this.getDB().exec('SELECT last_insert_rowid() as id');
      const id = result.length > 0 ? Number(result[0].values[0][0]) : 0;
      this.saveToFile();
      return id;
    } catch (e: any) {
      console.error(`[DB] 插入错误: ${sql}`, e.message);
      return 0;
    }
  }

  update(table: string, id: number, data: Record<string, any>): boolean {
    data.updated_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const setClause = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ${id}`;
    try {
      this.getDB().run(sql, [...Object.values(data)] as any[]);
      this.saveToFile();
      return true;
    } catch (e: any) {
      console.error(`[DB] 更新错误: ${sql}`, e.message);
      return false;
    }
  }

  softDelete(table: string, id: number): boolean {
    return this.update(table, id, { is_deleted: 1 } as any);
  }

  hardDelete(table: string, id: number): boolean {
    try {
      this.getDB().run(`DELETE FROM ${table} WHERE id = ${id}`);
      this.saveToFile();
      return true;
    } catch (e) {
      return false;
    }
  }

  // ==================== 全文搜索 ====================

  search(ftsTable: string, keyword: string, limit: number = 20): any[] {
    try {
      const safeKeyword = keyword.replace(/['"]/g, '');
      const sql = `SELECT * FROM ${ftsTable} WHERE ${ftsTable} MATCH ? LIMIT ${limit}`;
      const results = this.getDB().exec(sql, [safeKeyword]);
      return results.length > 0 ? this.rowsToObjects(results[0]) : [];
    } catch (e) {
      return [];
    }
  }

  // ==================== 统计报表 ====================

  stats(): Record<string, number> {
    const db = this.getDB();
    const get = (sql: string) => {
      try {
        const r = db.exec(sql);
        return r.length > 0 ? Number(r[0].values[0][0]) : 0;
      } catch { return 0; }
    };
    return {
      instruments: get('SELECT COUNT(*) FROM instruments WHERE is_deleted=0'),
      projects: get('SELECT COUNT(*) FROM projects WHERE is_deleted=0'),
      tracks: get('SELECT COUNT(*) FROM tracks WHERE is_deleted=0'),
      copyrights: get('SELECT COUNT(*) FROM copyrights WHERE is_deleted=0'),
      templates: get('SELECT COUNT(*) FROM templates WHERE is_deleted=0'),
      totalFileSize: get('SELECT COALESCE(SUM(file_size),0) FROM instruments WHERE is_deleted=0'),
    };
  }

  // ==================== 活动日志 ====================

  log(action: string, targetType: string, targetId: number, detail: string = '') {
    this.getDB().run(
      'INSERT INTO activity_log (action, target_type, target_id, detail) VALUES (?, ?, ?, ?)',
      [action, targetType, targetId, detail]
    );
    this.saveToFile();
  }

  getActivity(limit: number = 50): any[] {
    try {
      const results = this.getDB().exec(`SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ${limit}`);
      return results.length > 0 ? this.rowsToObjects(results[0]) : [];
    } catch { return []; }
  }

  // ==================== 原生SQL ====================

  /** 执行原生 SQL (参数化) */
  run(sql: string, params: any[] = []) {
    try {
      this.getDB().run(sql, params as any[]);
      this.saveToFile();
    } catch (e: any) {
      console.error(`[DB] SQL错误: ${sql.slice(0, 80)}`, e.message);
    }
  }

  /** 获取表内最大ID */
  getMaxId(table: string): number {
    try {
      const r = this.getDB().exec(`SELECT COALESCE(MAX(id), 0) as max_id FROM ${table}`);
      return r.length > 0 ? Number(r[0].values[0][0]) : 0;
    } catch { return 0; }
  }

  // ==================== 工具方法 ====================

  private rowsToObjects(result: { columns: string[], values: any[][] }): any[] {
    return result.values.map(row => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  private rowToObject(result: { columns: string[], values: any[][] }): any {
    const obj: Record<string, any> = {};
    result.columns.forEach((col, i) => { obj[col] = result.values[0][i]; });
    return obj;
  }

  close() {
    if (this.db) {
      this.saveToFile();
      this.db.close();
      this.db = null;
    }
  }
}

/** 全局单例 */
export const db = DatabaseManager.getInstance();
export default db;
