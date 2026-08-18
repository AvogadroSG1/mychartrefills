import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

import { launchBrowser } from './browser.js';
import { checkSession, loginInteractive } from './auth.js';
import { extractMedicationsFromPage } from './parser.js';
import { selectPrescriptionsToRefill, processRefillWorkflow } from './refills.js';
import { loadConfig, saveConfig } from './config.js';

export function createMcpServer() {
  const server = new Server(
    {
      name: 'mychart-refills',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'mychart_check_auth',
          description: 'Check if an active, authenticated Johns Hopkins MyChart session exists in the local profile.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'mychart_login',
          description: 'Launch an interactive browser window to log in to MyChart and complete 2FA authentication.',
          inputSchema: {
            type: 'object',
            properties: {
              timeout_minutes: {
                type: 'number',
                description: 'Maximum time in minutes to wait for 2FA/login completion (default: 5)'
              }
            }
          }
        },
        {
          name: 'mychart_list_prescriptions',
          description: 'Retrieve all active prescriptions from MyChart, identifying which medications are due soon for refill.',
          inputSchema: {
            type: 'object',
            properties: {
              due_only: {
                type: 'boolean',
                description: 'If true, returns only prescriptions marked Refill Due Soon'
              }
            }
          }
        },
        {
          name: 'mychart_submit_refill',
          description: 'Submit or dry-run a prescription refill request through MyChart for specified Order IDs or all due medications.',
          inputSchema: {
            type: 'object',
            properties: {
              order_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of Order IDs to refill'
              },
              all_due: {
                type: 'boolean',
                description: 'If true, refills all prescriptions marked Due Soon'
              },
              dry_run: {
                type: 'boolean',
                description: 'If true (default), validates the refill without final submission. Set to false to execute real submission.',
                default: true
              }
            }
          }
        },
        {
          name: 'mychart_get_config',
          description: 'Get current MyChart refills configuration (medication whitelist, default pharmacy).',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'mychart_set_config',
          description: 'Update MyChart refills configuration.',
          inputSchema: {
            type: 'object',
            properties: {
              whitelist: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of whitelisted medication names or order IDs'
              },
              preferred_pharmacy_id: {
                type: 'string',
                description: 'Preferred pharmacy ID'
              }
            }
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      switch (name) {
        case 'mychart_check_auth': {
          const context = await launchBrowser({ headless: true });
          try {
            const session = await checkSession(context);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(session, null, 2)
                }
              ]
            };
          } finally {
            try { await context.close(); } catch {}
          }
        }

        case 'mychart_login': {
          const timeoutMs = (args.timeout_minutes || 5) * 60 * 1000;
          const result = await loginInteractive({ timeoutMs });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2)
              }
            ]
          };
        }

        case 'mychart_list_prescriptions': {
          const context = await launchBrowser({ headless: true });
          try {
            const session = await checkSession(context);
            if (!session.authenticated) {
              return {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: 'MyChart session expired or not authenticated. Please run the `mychart_login` tool to authenticate.'
                  }
                ]
              };
            }

            const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
            const prescriptions = await extractMedicationsFromPage(page);
            const config = loadConfig();

            const filtered = args.due_only ? prescriptions.filter(p => p.isDueSoon) : prescriptions;
            const enriched = filtered.map(p => {
              const isWhitelisted = config.whitelist && config.whitelist.length > 0
                ? config.whitelist.some(w => p.name.toLowerCase().includes(w.toLowerCase()) || p.orderId === w)
                : true;
              return { ...p, isWhitelisted };
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    patient: session.patientName,
                    count: enriched.length,
                    prescriptions: enriched
                  }, null, 2)
                }
              ]
            };
          } finally {
            try { await context.close(); } catch {}
          }
        }

        case 'mychart_submit_refill': {
          const dryRun = args.dry_run !== false; // default true
          const allDue = Boolean(args.all_due);
          const orderIds = Array.isArray(args.order_ids) ? args.order_ids : [];

          if (!allDue && orderIds.length === 0) {
            return {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: 'Error: Must specify either `order_ids` (array) or `all_due: true`.'
                }
              ]
            };
          }

          const context = await launchBrowser({ headless: true });
          try {
            const session = await checkSession(context);
            if (!session.authenticated) {
              return {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: 'MyChart session expired. Please run `mychart_login` first.'
                  }
                ]
              };
            }

            const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
            const allPrescriptions = await extractMedicationsFromPage(page);
            const config = loadConfig();

            const selected = selectPrescriptionsToRefill(allPrescriptions, {
              targetIds: orderIds,
              allDue,
              whitelist: config.whitelist
            });

            if (selected.length === 0) {
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: false,
                      message: 'No matching prescriptions found to refill.'
                    }, null, 2)
                  }
                ]
              };
            }

            const result = await processRefillWorkflow(page, {
              targetPrescriptions: selected,
              preferredPharmacyId: config.preferredPharmacyId,
              dryRun
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2)
                }
              ]
            };
          } finally {
            try { await context.close(); } catch {}
          }
        }

        case 'mychart_get_config': {
          const config = loadConfig();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(config, null, 2)
              }
            ]
          };
        }

        case 'mychart_set_config': {
          const config = loadConfig();
          if (Array.isArray(args.whitelist)) {
            config.whitelist = args.whitelist;
          }
          if (args.preferred_pharmacy_id) {
            config.preferredPharmacyId = args.preferred_pharmacy_id;
          }
          saveConfig(config);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ success: true, updatedConfig: config }, null, 2)
              }
            ]
          };
        }

        default:
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown tool: ${name}` }]
          };
      }
    } catch (err) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Error executing ${name}: ${err.message}` }]
      };
    }
  });

  return server;
}

export async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MyChart Refills MCP server running on stdio.');
}
