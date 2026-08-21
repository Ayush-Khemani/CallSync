const crypto = require('crypto');
const config = require('../config/env');

function getKey() {
  if (!config.tokenEncryptionKey) {
    return null;
  }

  const key = Buffer.from(config.tokenEncryptionKey, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }

  return key;
}

function encryptToken(token) {
  if (!token) return token;
  const key = getKey();
  if (!key) return token;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptToken(value) {
  if (!value) return value;
  const encrypted = value.startsWith('enc:');
  if (!encrypted) return value;

  const key = getKey();
  if (!key) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required to decrypt stored OAuth tokens');
  }

  const parts = value.split(':');
  if (parts.length !== 4) {
    throw new Error('Stored OAuth token has an invalid encrypted format');
  }

  const [, ivBase64, tagBase64, encryptedBase64] = parts;
  const iv = Buffer.from(ivBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');
  const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]).toString('utf8');
}

function tokenEncryptionConfigured() {
  return Boolean(config.tokenEncryptionKey);
}

module.exports = { encryptToken, decryptToken, tokenEncryptionConfigured };
