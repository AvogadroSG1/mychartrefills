import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const HOME = os.homedir();
const DEFAULT_CONFIG_DIR = path.join(HOME, '.config', 'mychart-refills');

export const BASE_URL = process.env.MYCHART_BASE_URL || 'https://mychart.hopkinsmedicine.org/MyChart/';
export const PROFILE_DIR = process.env.MYCHART_PROFILE_DIR || path.join(DEFAULT_CONFIG_DIR, 'browser-profile');
export const CONFIG_FILE = process.env.MYCHART_CONFIG_FILE || path.join(DEFAULT_CONFIG_DIR, 'config.json');

export function ensureConfigDir() {
  if (!fs.existsSync(DEFAULT_CONFIG_DIR)) {
    fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadConfig() {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error(`Warning: Failed to parse config file at ${CONFIG_FILE}:`, err.message);
    }
  }
  return {
    whitelist: [],
    preferredPharmacyId: null,
    defaultDeliveryMethod: 1, // 1 = Pickup, 2 = Mail
    autoApproveDueSoon: false
  };
}

export function saveConfig(cfg) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
