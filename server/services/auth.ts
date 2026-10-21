/**
 * ============================================================
 *  用户认证服务 — Token 签发/验证 + 密码哈希
 *  零依赖，SHA256 + 时间戳 Token
 * ============================================================
 */
import { createHash, randomBytes } from 'crypto';

const SECRET = randomBytes(32).toString('hex'); // 每次重启更换，仅用于Token签名
const TOKEN_TTL = 24 * 3600 * 1000; // 24小时

/** SHA256 哈希 */
export function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/** 签发 Token: base64(username:expires:signature) */
export function signToken(username: string, role: string): string {
  const expires = Date.now() + TOKEN_TTL;
  const payload = `${username}:${role}:${expires}`;
  const sig = sha256(payload + SECRET);
  return Buffer.from(`${payload}:${sig}`, 'utf8').toString('base64');
}

/** 验证 Token，成功返回 {username, role}，失败返回 null */
export function verifyToken(token: string): { username: string; role: string } | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 4) return null;
    const [username, role, expiresStr, sig] = parts;
    const payload = `${username}:${role}:${expiresStr}`;
    if (sha256(payload + SECRET) !== sig) return null;
    if (Date.now() > Number(expiresStr)) return null;
    return { username, role };
  } catch {
    return null;
  }
}
