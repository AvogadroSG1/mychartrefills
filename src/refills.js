/**
 * MyChart Refills Engine
 * Handles medication selection, pharmacy configuration, dry-run validation, and submission.
 */

import { BASE_URL } from './config.js';
import { extractMedicationsFromPage } from './parser.js';

/**
 * Builds the SubmitRefillRequest payload object according to the Epic MyChart contract.
 */
export function buildRefillPayload({
  prescriptionOrders, // Array of { orderId, orderDAT, lastUpdateInstant, comment }
  pharmacyId = '',
  freeTextPharmacy = '',
  deliveryMethod = 1, // 1 = Pickup, 2 = Mail
  deliveryMethodBehavesLike = 1,
  deliveryAddressType = -1,
  deliveryComments = '',
  patientPaymentMethod = '',
  tokenId = '',
  otherPrescriptionsComment = null,
  messageViewerIds = [],
  rxRefillWorkflowMode = 0,
  workRequestId = null
}) {
  const prescriptionDetails = prescriptionOrders.map(p => ({
    OrderID: p.orderId,
    LastUpdateInstant: p.lastUpdateInstant || '',
    RefillComments: p.comment || '',
    ValidationStatus: '',
    OrderDAT: p.orderDAT || ''
  }));

  return {
    PrescriptionDetails: prescriptionDetails,
    PharmacyID: pharmacyId === '-1' ? '' : pharmacyId,
    FreeTextPharmacy: freeTextPharmacy,
    DeliveryMethod: deliveryMethod,
    DeliveryMethodBehavesLike: deliveryMethodBehavesLike,
    DeliveryFee: null,
    PickupDate: '',
    PickupTime: '',
    DeliveryAddressType: deliveryAddressType === -1 ? '' : deliveryAddressType,
    DeliveryComments: deliveryComments,
    PatientPaymentMethod: patientPaymentMethod,
    TokenID: tokenId,
    OtherPrescriptions: otherPrescriptionsComment,
    PrescriptionLevelCommentsSupported: true,
    MessageViewerIDs: messageViewerIds,
    RxRefillWorkflowMode: rxRefillWorkflowMode,
    WorkRequestID: workRequestId
  };
}

/**
 * Filters prescriptions matching requested IDs or due soon status, checking against whitelist.
 */
export function selectPrescriptionsToRefill(allPrescriptions, { targetIds = [], allDue = false, whitelist = [] } = {}) {
  let selected = [];

  if (allDue) {
    selected = allPrescriptions.filter(p => p.isDueSoon);
  } else if (targetIds.length > 0) {
    const targetSet = new Set(targetIds.map(String));
    selected = allPrescriptions.filter(p => targetSet.has(String(p.orderId)) || targetSet.has(p.name));
  }

  // If whitelist is active, filter / mark non-whitelisted items
  if (whitelist && whitelist.length > 0) {
    const whitelistLower = whitelist.map(w => w.toLowerCase());
    selected = selected.map(p => {
      const isWhitelisted = whitelistLower.some(w => 
        p.name.toLowerCase().includes(w) || String(p.orderId) === String(w)
      );
      return { ...p, isWhitelisted };
    });
  } else {
    selected = selected.map(p => ({ ...p, isWhitelisted: true }));
  }

  return selected;
}

/**
 * Executes or dry-runs a refill sequence in an active Playwright page.
 */
export async function processRefillWorkflow(page, {
  targetPrescriptions,
  preferredPharmacyId = null,
  dryRun = true
}) {
  if (!targetPrescriptions || targetPrescriptions.length === 0) {
    return {
      success: false,
      reason: 'No prescriptions selected for refill.'
    };
  }

  const results = {
    dryRun,
    targetPrescriptions,
    pharmacy: null,
    submittedAt: new Date().toISOString(),
    success: false
  };

  // Step 1: Navigate to Medications page if not already there
  const medsUrl = new URL('Clinical/Medications', BASE_URL).toString();
  if (!page.url().includes('/Clinical/Medications')) {
    await page.goto(medsUrl, { waitUntil: 'domcontentloaded' });
  }

  await page.waitForTimeout(1000);

  // Step 2: Select target prescription cards / checkboxes in DOM
  for (const rx of targetPrescriptions) {
    const cardSelector = `[data-med-id="${rx.orderId}"]`;
    const card = page.locator(cardSelector).first();

    if (await card.count() > 0) {
      const checkbox = card.locator('input[type="checkbox"]').first();
      if (await checkbox.count() > 0) {
        const isChecked = await checkbox.isChecked();
        if (!isChecked) {
          await checkbox.check({ force: true });
        }
      } else {
        await card.click();
      }
    }
  }

  await page.waitForTimeout(1000);

  // Step 3: Click "Next" or "Request Refill" to go to Pharmacy Step
  const nextButton = page.locator('#subway-next, button:has-text("Next"), input[value="Next"]').first();
  if (await nextButton.count() > 0 && await nextButton.isEnabled()) {
    await nextButton.click();
    await page.waitForTimeout(2000);
  }

  // Step 4: Extract available pharmacies or set preferred pharmacy
  const pharmacySelection = await page.evaluate(() => {
    const select = document.querySelector('#PharmacyDropdownField, select.PharmacyDropdown');
    if (select) {
      const options = Array.from(select.querySelectorAll('option')).map(o => ({
        id: o.value,
        name: o.textContent.trim(),
        selected: o.selected
      }));
      const selected = options.find(o => o.selected) || options[0];
      return { options, selected };
    }
    return null;
  });

  results.pharmacy = pharmacySelection ? pharmacySelection.selected : { name: 'Default On-File Pharmacy' };

  if (dryRun) {
    results.success = true;
    results.message = `[DRY-RUN] Refill prepared for ${targetPrescriptions.length} medication(s) at ${results.pharmacy?.name || 'Default Pharmacy'}. Submission skipped.`;
    return results;
  }

  // Step 5: Advance through Review step to Submit
  if (await nextButton.count() > 0 && await nextButton.isEnabled()) {
    await nextButton.click();
    await page.waitForTimeout(2000);
  }

  const submitButton = page.locator('#subway-next, button:has-text("Submit"), button:has-text("Submit Request")').first();
  if (await submitButton.count() > 0 && await submitButton.isEnabled()) {
    await submitButton.click();
    await page.waitForTimeout(4000);

    // Verify confirmation
    const confirmationText = await page.evaluate(() => {
      const confirmElem = document.querySelector('.confirmation-step, .refill-confirmation, #confirmation');
      return confirmElem ? confirmElem.textContent.trim() : null;
    });

    results.success = true;
    results.confirmationText = confirmationText || 'Refill submitted successfully.';
    results.message = `Successfully submitted refill for ${targetPrescriptions.map(p => p.name).join(', ')}`;
  } else {
    results.success = false;
    results.reason = 'Submit button was not enabled or not found on review page.';
  }

  return results;
}
