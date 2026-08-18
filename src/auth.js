import { launchBrowser } from './browser.js';
import { BASE_URL, PROFILE_DIR } from './config.js';

export async function checkSession(context) {
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  const medsUrl = new URL('Clinical/Medications', BASE_URL).toString();

  try {
    const response = await page.goto(medsUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const currentUrl = page.url();

    // Check if redirected to login
    if (currentUrl.includes('/Authentication/Login') || currentUrl.includes('/login') || currentUrl.includes('/oauth')) {
      return {
        authenticated: false,
        url: currentUrl,
        reason: 'Redirected to login page'
      };
    }

    // Check for login forms on page
    const hasLoginForm = await page.locator('#loginForm, input#Login, input[name="Login"]').count() > 0;
    if (hasLoginForm) {
      return {
        authenticated: false,
        url: currentUrl,
        reason: 'Login form present'
      };
    }

    // Try to extract patient / user name if present
    let patientName = null;
    try {
      const nameElem = page.locator('#userDisplayName, .user-name, .patient-name, .header__user-name').first();
      if (await nameElem.count() > 0) {
        patientName = (await nameElem.textContent() || '').trim();
      }
    } catch {
      // Non-critical
    }

    return {
      authenticated: true,
      url: currentUrl,
      patientName: patientName || 'Patient'
    };
  } catch (err) {
    return {
      authenticated: false,
      url: page.url(),
      error: err.message
    };
  }
}

export async function loginInteractive({ profileDir = PROFILE_DIR, timeoutMs = 300000 } = {}) {
  console.log('Launching browser for interactive Johns Hopkins MyChart login...');
  const context = await launchBrowser({ headless: false, profileDir });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  const loginUrl = new URL('Authentication/Login', BASE_URL).toString();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  console.log('\nPlease log in to MyChart and complete any 2FA/SMS challenge in the browser window.');
  console.log(`Waiting up to ${Math.round(timeoutMs / 60000)} minutes for authentication to complete...\n`);

  const startTime = Date.now();
  let authenticated = false;
  let finalUrl = '';

  while (Date.now() - startTime < timeoutMs) {
    if (context.pages().length === 0) {
      throw new Error('Browser window was closed before login was completed.');
    }

    const currentUrl = page.url();
    // Successfully passed login when URL leaves Authentication/Login and reaches inside.asp / Clinical / home
    if (!currentUrl.includes('/Authentication/Login') &&
        (currentUrl.includes('/Clinical/') || currentUrl.includes('/inside.asp') || currentUrl.includes('/home') || currentUrl.includes('/portal'))) {
      authenticated = true;
      finalUrl = currentUrl;
      break;
    }

    await page.waitForTimeout(1000);
  }

  if (!authenticated) {
    await context.close();
    throw new Error('Login timed out before reaching authenticated landing page.');
  }

  console.log('Login detected! Stabilizing session cookies...');
  await page.waitForTimeout(3000);

  // Verify access to medications page
  const medsUrl = new URL('Clinical/Medications', BASE_URL).toString();
  await page.goto(medsUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await context.close();
  console.log('Session successfully saved to persistent profile.');

  return { success: true, url: finalUrl };
}
