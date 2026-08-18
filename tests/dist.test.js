import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpServer } from '../src/mcp.js';

test('createMcpServer loads cleanly', async () => {
  const server = createMcpServer();
  assert.ok(server);
});
