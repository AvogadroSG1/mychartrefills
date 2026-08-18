import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRefillPayload, selectPrescriptionsToRefill } from '../src/refills.js';

test('buildRefillPayload constructs valid Epic MyChart refill request object', () => {
  const payload = buildRefillPayload({
    prescriptionOrders: [
      { orderId: '987654', orderDAT: '12345678', lastUpdateInstant: '2026-08-17T00:00:00Z', comment: 'Monthly refill' }
    ],
    pharmacyId: 'PHARM_1',
    deliveryMethod: 1
  });

  assert.equal(payload.PharmacyID, 'PHARM_1');
  assert.equal(payload.DeliveryMethod, 1);
  assert.equal(payload.PrescriptionDetails.length, 1);
  assert.equal(payload.PrescriptionDetails[0].OrderID, '987654');
  assert.equal(payload.PrescriptionDetails[0].RefillComments, 'Monthly refill');
  assert.equal(payload.PrescriptionLevelCommentsSupported, true);
});

test('selectPrescriptionsToRefill filters by due soon and whitelist', () => {
  const prescriptions = [
    { orderId: '1', name: 'Atorvastatin 20mg', isDueSoon: true },
    { orderId: '2', name: 'Lisinopril 10mg', isDueSoon: false },
    { orderId: '3', name: 'Metformin 500mg', isDueSoon: true }
  ];

  // All due without whitelist
  const due = selectPrescriptionsToRefill(prescriptions, { allDue: true });
  assert.equal(due.length, 2);
  assert.equal(due[0].orderId, '1');
  assert.equal(due[1].orderId, '3');

  // Specific target ID
  const specific = selectPrescriptionsToRefill(prescriptions, { targetIds: ['2'] });
  assert.equal(specific.length, 1);
  assert.equal(specific[0].orderId, '2');

  // Whitelist filtering
  const withWhitelist = selectPrescriptionsToRefill(prescriptions, {
    allDue: true,
    whitelist: ['Atorvastatin']
  });
  assert.equal(withWhitelist.length, 2);
  assert.equal(withWhitelist.find(p => p.orderId === '1').isWhitelisted, true);
  assert.equal(withWhitelist.find(p => p.orderId === '3').isWhitelisted, false);
});
