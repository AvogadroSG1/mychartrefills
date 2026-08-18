import { launchBrowser } from './browser.js';
import { checkSession, loginInteractive } from './auth.js';
import { extractMedicationsFromPage } from './parser.js';
import { selectPrescriptionsToRefill, processRefillWorkflow } from './refills.js';
import { loadConfig, saveConfig, CONFIG_FILE } from './config.js';

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || 'help';

  switch (command) {
    case 'auth':
      return await handleAuth(argv.slice(1));
    case 'list':
      return await handleList(argv.slice(1));
    case 'submit':
      return await handleSubmit(argv.slice(1));
    case 'config':
      return await handleConfig(argv.slice(1));
    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      return 0;
  }
}

function printHelp() {
  console.log(`
MyChart Autonomous Refills CLI

Usage:
  mychart-refills <command> [options]

Commands:
  auth       Verify session status or launch interactive login with 2FA
  list       List active prescriptions and refill eligibility
  submit     Submit or dry-run refill requests for selected prescriptions
  config     View or update whitelist and pharmacy configuration
  help       Show this help message

Auth Options:
  --check    Quietly check if session is active (exits 0 if valid, 1 if expired)
  --login    Force opening a browser window to log in / refresh 2FA

List Options:
  --json     Output structured JSON
  --due-only List only medications marked Refill Due Soon

Submit Options:
  --ids <id,...>    Comma-separated list of Order IDs or Medication Names to refill
  --all-due         Refill all prescriptions marked Due Soon
  --dry-run         Validate refill sequence and pharmacy without final submission (default)
  --execute         Perform final submission
  --pharmacy <id>   Override target pharmacy ID

Config Options:
  --show            Show current configuration
  --set-whitelist <m1,m2> Update medication whitelist
  --set-pharmacy <id>     Set preferred pharmacy ID
`);
}

async function handleAuth(args) {
  const isCheck = args.includes('--check');
  const isLogin = args.includes('--login') || args.includes('--force');

  if (isLogin) {
    await loginInteractive();
    return 0;
  }

  const context = await launchBrowser({ headless: true });
  try {
    const session = await checkSession(context);
    if (session.authenticated) {
      if (!isCheck) {
        console.log(`✓ Active session verified for ${session.patientName} on Johns Hopkins MyChart.`);
      }
      return 0;
    } else {
      if (isCheck) {
        return 1;
      }
      console.log('Session expired or not logged in. Launching interactive browser for 2FA...');
      await context.close();
      await loginInteractive();
      return 0;
    }
  } finally {
    try { await context.close(); } catch {}
  }
}

async function handleList(args) {
  const jsonOutput = args.includes('--json');
  const dueOnly = args.includes('--due-only');

  const context = await launchBrowser({ headless: true });
  try {
    const session = await checkSession(context);
    if (!session.authenticated) {
      console.error('Session expired. Please run `mychart-refills auth --login` to sign in.');
      return 1;
    }

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    const prescriptions = await extractMedicationsFromPage(page);
    const config = loadConfig();

    const filtered = dueOnly ? prescriptions.filter(p => p.isDueSoon) : prescriptions;

    // Apply whitelist info
    const enriched = filtered.map(p => {
      const isWhitelisted = config.whitelist && config.whitelist.length > 0
        ? config.whitelist.some(w => p.name.toLowerCase().includes(w.toLowerCase()) || p.orderId === w)
        : true;
      return { ...p, isWhitelisted };
    });

    if (jsonOutput) {
      console.log(JSON.stringify({
        patient: session.patientName,
        retrievedAt: new Date().toISOString(),
        total: enriched.length,
        prescriptions: enriched
      }, null, 2));
      return 0;
    }

    console.log(`\nPrescriptions for ${session.patientName} (${enriched.length} found):\n`);
    for (const rx of enriched) {
      const dueBadge = rx.isDueSoon ? ' [REFILL DUE SOON]' : ' [ACTIVE]';
      const whiteBadge = rx.isWhitelisted ? '✓ Whitelisted' : '-';
      console.log(`* [${rx.orderId || 'N/A'}] ${rx.name}${dueBadge}`);
      if (rx.instructions) console.log(`  Sig: ${rx.instructions}`);
      if (rx.provider) console.log(`  Provider: ${rx.provider}`);
      if (rx.pharmacy) console.log(`  Pharmacy: ${rx.pharmacy}`);
      console.log(`  Whitelist Status: ${whiteBadge}\n`);
    }

    return 0;
  } finally {
    try { await context.close(); } catch {}
  }
}

async function handleSubmit(args) {
  const isExecute = args.includes('--execute');
  const dryRun = !isExecute || args.includes('--dry-run');
  const allDue = args.includes('--all-due');
  const jsonOutput = args.includes('--json');

  let targetIds = [];
  const idsIndex = args.indexOf('--ids');
  if (idsIndex !== -1 && args[idsIndex + 1]) {
    targetIds = args[idsIndex + 1].split(',').map(s => s.trim());
  }

  if (!allDue && targetIds.length === 0) {
    console.error('Error: Must specify --ids <orderId,...> or --all-due');
    return 1;
  }

  const context = await launchBrowser({ headless: true });
  try {
    const session = await checkSession(context);
    if (!session.authenticated) {
      console.error('Session expired. Please run `mychart-refills auth --login` to sign in.');
      return 1;
    }

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
    const allPrescriptions = await extractMedicationsFromPage(page);
    const config = loadConfig();

    const selected = selectPrescriptionsToRefill(allPrescriptions, {
      targetIds,
      allDue,
      whitelist: config.whitelist
    });

    if (selected.length === 0) {
      console.log('No matching prescriptions found to refill.');
      return 0;
    }

    if (!jsonOutput) {
      console.log(`\n${dryRun ? '[DRY-RUN MODE]' : '[EXECUTION MODE]'} Preparing refill for:`);
      for (const rx of selected) {
        console.log(` - [${rx.orderId}] ${rx.name}`);
      }
      console.log('');
    }

    const result = await processRefillWorkflow(page, {
      targetPrescriptions: selected,
      preferredPharmacyId: config.preferredPharmacyId,
      dryRun
    });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.message || (result.success ? 'Success' : 'Failed: ' + result.reason));
      if (result.confirmationText) {
        console.log(`Confirmation details: ${result.confirmationText}`);
      }
    }

    return result.success ? 0 : 1;
  } finally {
    try { await context.close(); } catch {}
  }
}

async function handleConfig(args) {
  const config = loadConfig();

  const showIndex = args.indexOf('--show');
  const whitelistIndex = args.indexOf('--set-whitelist');
  const pharmacyIndex = args.indexOf('--set-pharmacy');

  if (whitelistIndex !== -1 && args[whitelistIndex + 1]) {
    config.whitelist = args[whitelistIndex + 1].split(',').map(s => s.trim());
    saveConfig(config);
    console.log('Updated whitelist:', config.whitelist);
    return 0;
  }

  if (pharmacyIndex !== -1 && args[pharmacyIndex + 1]) {
    config.preferredPharmacyId = args[pharmacyIndex + 1].trim();
    saveConfig(config);
    console.log('Updated preferred pharmacy ID:', config.preferredPharmacyId);
    return 0;
  }

  console.log(`\nCurrent Configuration (${CONFIG_FILE}):`);
  console.log(JSON.stringify(config, null, 2));
  return 0;
}
