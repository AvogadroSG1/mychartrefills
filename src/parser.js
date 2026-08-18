/**
 * Parser for MyChart Clinical/Medications page.
 * Extracts prescription list, refill eligibility, order IDs, and prescriber info.
 */

export async function extractMedicationsFromPage(page) {
  // Try evaluating internal Epic MyChart page models first
  const pageData = await page.evaluate(() => {
    // 1. Check if controller or templateData is in memory
    try {
      if (window.$$WP && window.$$WP.Clinical && window.$$WP.Clinical.Medications) {
        // Find bound controllers or data pool if accessible
        const form = document.querySelector('#MedicationForm');
        if (form && form.__wp_controller && form.__wp_controller._dataPool) {
          return {
            source: 'controller_datapool',
            data: form.__wp_controller._dataPool
          };
        }
      }
    } catch {
      // Continue to next extraction method
    }

    // 2. Extract from DOM cards (.medcard / .medicationcontainer)
    const cards = Array.from(document.querySelectorAll('.medcard, .medicationcontainer, [data-med-id]'));
    const prescriptions = [];

    for (const card of cards) {
      const orderId = card.getAttribute('data-med-id') || 
                      card.querySelector('[data-med-id]')?.getAttribute('data-med-id') ||
                      card.querySelector('input[type="checkbox"]')?.getAttribute('value') ||
                      '';

      const nameElem = card.querySelector('.medname, .medtitle, .med-name, .prescription-name, h3, h4');
      const name = nameElem ? nameElem.textContent.trim() : 'Unknown Medication';

      const sigElem = card.querySelector('.instructions, .sig, .medsig, .med-instructions');
      const instructions = sigElem ? sigElem.textContent.trim() : '';

      const providerElem = card.querySelector('.provider, .authorizing-provider, .ordering-provider, [data-provider]');
      const provider = providerElem ? providerElem.textContent.replace(/Prescribed by:?/i, '').trim() : '';

      const pharmacyElem = card.querySelector('.pharmacy, .pharmacy-name, [data-pharmacy]');
      const pharmacy = pharmacyElem ? pharmacyElem.textContent.replace(/Pharmacy:?/i, '').trim() : '';

      const checkbox = card.querySelector('input.styled-checkbox, input[type="checkbox"]');
      const isSelectable = !!checkbox && !checkbox.disabled;
      const isRefillEnabled = card.classList.contains('refill-enabled') || isSelectable;

      const refillStatusElem = card.querySelector('.refill-status, .badge, .status-text, .refilldue');
      const statusText = refillStatusElem ? refillStatusElem.textContent.trim() : '';

      // Determine if refill is due soon
      // Status code 5 in Epic corresponds to "Refill Due Soon" / "Needs Refill"
      const isDueSoon = isRefillEnabled || 
                        /due soon|refill now|refill due|needs refill/i.test(statusText) ||
                        card.querySelector('.refill-due-soon, .badge-warning') !== null;

      if (orderId || name !== 'Unknown Medication') {
        prescriptions.push({
          orderId,
          name,
          instructions,
          provider,
          pharmacy,
          isRefillEnabled,
          isDueSoon,
          statusText,
          rawCardClasses: card.className
        });
      }
    }

    return {
      source: 'dom_cards',
      prescriptions
    };
  });

  return formatPrescriptionList(pageData);
}

/**
 * Normalizes raw extracted data into clean, deterministic prescription models.
 */
export function formatPrescriptionList(rawResult) {
  if (!rawResult) {
    return [];
  }

  if (rawResult.source === 'dom_cards' && Array.isArray(rawResult.prescriptions)) {
    // Remove duplicates by orderId or name
    const seen = new Set();
    const result = [];
    for (const p of rawResult.prescriptions) {
      const key = p.orderId || p.name;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          orderId: p.orderId || '',
          name: p.name || '',
          instructions: p.instructions || '',
          provider: p.provider || '',
          pharmacy: p.pharmacy || '',
          statusText: p.statusText || (p.isDueSoon ? 'Refill Due Soon' : 'Active'),
          isRefillEnabled: Boolean(p.isRefillEnabled),
          isDueSoon: Boolean(p.isDueSoon)
        });
      }
    }
    return result;
  }

  return [];
}
