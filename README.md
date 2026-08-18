# MyChart Refills Automation

A deterministic CLI tool, MCP Server, and AI agent skill for automating prescription refills through Epic MyChart (Johns Hopkins Medicine and other Epic health systems).

---

## Features

- **Claude Desktop & Agent Ready**: Ships with a Model Context Protocol (MCP) server so Claude Desktop and AI agents can inspect active scripts and submit refills conversationally.
- **Persistent Session & 2FA Handling**: Launches an interactive browser session once to establish device trust and 2FA; subsequent operations run headlessly in the background.
- **Deterministic Prescription Inspector**: Scrapes and parses active prescriptions, detecting refill eligibility (`isDueSoon`), dosage instructions, authorized prescribers, and target pharmacies.
- **Safe Refill Engine**: Supports dry-run validation (`--dry-run`) before executing actual refill submissions (`--execute`).
- **Configurable Whitelist**: Allows whitelisting specific medication names or order IDs to prevent accidental or unwanted refills.

---

## Prerequisites

- **Node.js**: `v20.0.0` or higher
- **Playwright Chromium**: Downloaded automatically during setup

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
npx playwright install chromium
```

### 2. Optional Global Linking
To use `mychart-refills` from any directory:
```bash
npm link
```
*(Or use `./bin/mychart-refills` directly from the repository root).*

### 3. Authenticate with MyChart
Run the interactive login command. This opens a browser window where you log in and complete your 2FA verification:
```bash
./bin/mychart-refills auth --login
```
Once logged in, the session and device trust cookies are stored securely in `~/.config/mychart-refills/browser-profile`.

---

## Claude Desktop Setup (MCP)

To use MyChart Refills directly inside **Claude Desktop**:

### 1. Open Claude Desktop Configuration
On macOS, edit:
`~/Library/Application Support/Claude/claude_desktop_config.json`

On Windows, edit:
`%APPDATA%\Claude\claude_desktop_config.json`

### 2. Add the `mychart-refills` MCP Server
```json
{
  "mcpServers": {
    "mychart-refills": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/mychart_refills/dist/my-chart-mcp.js"
      ]
    }
  }
}
```
*(Replace `/ABSOLUTE/PATH/TO/mychart_refills` with the actual path to this cloned repository).*

### 3. Restart Claude Desktop
Restart Claude Desktop. You will now see the hammer icon with tools available:
- `mychart_check_auth`: Check session status.
- `mychart_login`: Launch interactive browser for 2FA login.
- `mychart_list_prescriptions`: Inspect active medications and see which are due soon.
- `mychart_submit_refill`: Dry-run or submit prescription refills.
- `mychart_get_config` / `mychart_set_config`: Manage medication whitelists and default pharmacies.

---

## CLI Usage Guide

### Check Session Status
```bash
./bin/mychart-refills auth --check
```
Exits `0` if the session is valid, or `1` if expired.

### List Prescriptions
```bash
# List all active prescriptions with refill status
./bin/mychart-refills list

# Filter only medications due for refill
./bin/mychart-refills list --due-only

# Output as structured JSON (for scripts/agents)
./bin/mychart-refills list --json
```

### Submit Refill Requests
```bash
# Dry-run refill for all due medications (validates without submitting)
./bin/mychart-refills submit --all-due --dry-run

# Dry-run refill for specific order IDs
./bin/mychart-refills submit --ids 123456,789012 --dry-run

# Execute actual refill submission
./bin/mychart-refills submit --ids 123456 --execute

# Execute refill for all due medications
./bin/mychart-refills submit --all-due --execute
```

### Configuration & Whitelist
Configuration is stored in `~/.config/mychart-refills/config.json`.

```bash
# View current config
./bin/mychart-refills config --show

# Set medication whitelist (comma-separated names or order IDs)
./bin/mychart-refills config --set-whitelist "Atorvastatin,Lisinopril"

# Set preferred pharmacy ID
./bin/mychart-refills config --set-pharmacy "PHARMACY_ID"
```

---

## Multi-Health System Support

By default, the tool connects to Johns Hopkins MyChart (`https://mychart.hopkinsmedicine.org/MyChart/`). To use with another Epic MyChart provider, set the `MYCHART_BASE_URL` environment variable:

```bash
export MYCHART_BASE_URL="https://mychart.provider.org/MyChart/"
./bin/mychart-refills auth --login
```

---

## Running Tests

```bash
npm test
```
