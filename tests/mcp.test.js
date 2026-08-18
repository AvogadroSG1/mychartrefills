import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMcpServer } from '../src/mcp.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

test('createMcpServer registers all required tools', async () => {
  const server = createMcpServer();
  assert.ok(server);

  const handler = server._requestHandlers.get('tools/list');
  assert.ok(handler, 'ListTools handler should be registered');

  const toolsResponse = await handler({ method: 'tools/list', params: {} });
  assert.ok(toolsResponse && Array.isArray(toolsResponse.tools));

  const toolNames = toolsResponse.tools.map(t => t.name);
  assert.ok(toolNames.includes('mychart_check_auth'));
  assert.ok(toolNames.includes('mychart_login'));
  assert.ok(toolNames.includes('mychart_list_prescriptions'));
  assert.ok(toolNames.includes('mychart_submit_refill'));
  assert.ok(toolNames.includes('mychart_get_config'));
  assert.ok(toolNames.includes('mychart_set_config'));
});
