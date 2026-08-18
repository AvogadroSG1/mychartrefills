import { chromium } from 'playwright';
import { PROFILE_DIR, ensureConfigDir } from './config.js';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

export async function launchBrowser({ headless = true, profileDir = PROFILE_DIR } = {}) {
  ensureConfigDir();

  const launchOptions = {
    headless,
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-default-browser-check'
    ],
    ignoreHTTPSErrors: true
  };

  // Try using system Chrome first (convenient for users without separate Playwright chromium install)
  try {
    return await chromium.launchPersistentContext(profileDir, {
      ...launchOptions,
      channel: 'chrome'
    });
  } catch (chromeErr) {
    // Fall back to standard bundled Chromium
    try {
      return await chromium.launchPersistentContext(profileDir, launchOptions);
    } catch (fallbackErr) {
      throw new Error(
        `Failed to launch browser. Please ensure Google Chrome is installed, or run 'npx playwright install chromium'. Original error: ${fallbackErr.message}`
      );
    }
  }
}
