import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrescriptionList } from '../src/parser.js';

test('formatPrescriptionList normalizes valid prescription cards', () => {
  const sampleData = {
    source: 'dom_cards',
    prescriptions: [
      {
        orderId: '123456',
        name: 'Atorvastatin 20 MG Oral Tablet',
        instructions: 'Take 1 tablet by mouth daily',
        provider: 'Dr. Smith',
        pharmacy: 'Johns Hopkins Outpatient Pharmacy',
        isRefillEnabled: true,
        isDueSoon: true,
        statusText: 'Refill Due Soon'
      },
      {
        orderId: '789012',
        name: 'Lisinopril 10 MG Oral Tablet',
        instructions: 'Take 1 tablet daily',
        provider: 'Dr. Jones',
        pharmacy: 'CVS Pharmacy',
        isRefillEnabled: false,
        isDueSoon: false,
        statusText: '3 Refills Remaining'
      }
    ]
  };

  const result = formatPrescriptionList(sampleData);
  assert.equal(result.length, 2);
  assert.equal(result[0].orderId, '123456');
  assert.equal(result[0].isDueSoon, true);
  assert.equal(result[1].orderId, '789012');
  assert.equal(result[1].isDueSoon, false);
});

test('formatPrescriptionList removes duplicates and handles empty data', () => {
  assert.deepEqual(formatPrescriptionList(null), []);
  assert.deepEqual(formatPrescriptionList({ source: 'empty', prescriptions: [] }), []);

  const dups = {
    source: 'dom_cards',
    prescriptions: [
      { orderId: '100', name: 'Med A', isRefillEnabled: true, isDueSoon: true },
      { orderId: '100', name: 'Med A', isRefillEnabled: true, isDueSoon: true }
    ]
  };
  const result = formatPrescriptionList(dups);
  assert.equal(result.length, 1);
});
