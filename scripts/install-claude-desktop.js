import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

let configPath = '';
if (isMac) {
  configPath = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
} else if (isWin) {
  configPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
} else {
  configPath = path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

const bundledServerPath = path.resolve(__dirname, '..', 'dist', 'my-chart-mcp.js');

console.log('--- Claude Desktop MyChart Refills Auto-Installer ---');
console.log(`Config File: ${configPath}`);
console.log(`Server Path: ${bundledServerPath}\n`);

// Ensure directory exists
const configDir = path.dirname(configPath);
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

let config = { mcpServers: {} };
if (fs.existsSync(configPath)) {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(raw);
    if (!config.mcpServers) {
      config.mcpServers = {};
    }
  } catch (err) {
    console.error(`Warning: Could not parse existing config (${err.message}). Backing up to claude_desktop_config.json.bak`);
    fs.copyFileSync(configPath, configPath + '.bak');
    config = { mcpServers: {} };
  }
}

// Add or update mychart-refills server
config.mcpServers['mychart-refills'] = {
  command: 'node',
  args: [bundledServerPath]
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

console.log('✓ Successfully configured Claude Desktop!');
console.log('✓ Added "mychart-refills" MCP server.');
console.log('\nNext steps:');
console.log('1. Restart Claude Desktop.');
console.log('2. In Claude Desktop, ask: "Check my active MyChart prescriptions" or "Log in to MyChart".\n');
