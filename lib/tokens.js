import { randomBytes } from 'crypto';

/**
 * Generate a cryptographically secure random token
 * @param {number} length - Token length (default: 30)
 * @returns {string} Random token
 */
export function generateToken(length = 30) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let token = '';
  
  for (let i = 0; i < length; i++) {
    token += chars[bytes[i] % chars.length];
  }
  
  return token;
}

/**
 * Generate a unique ID with prefix
 * @param {string} prefix - ID prefix (e.g., 'ANM', 'SEA', 'EPI', 'FIL')
 * @returns {string} Unique ID
 */
export function generateId(prefix = 'ID') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(6);
  let id = prefix + '_';
  
  for (let i = 0; i < 6; i++) {
    id += chars[bytes[i] % chars.length];
  }
  
  return id;
}
