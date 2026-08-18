# MyChart Refills Automation

A deterministic CLI tool, MCP Server, and AI agent skill for automating prescription refills through Epic MyChart (Johns Hopkins Medicine and other Epic health systems).

---

## Features

- **Claude Desktop & Agent Ready**: Ships with a Model Context Protocol (MCP) server so Claude Desktop and AI agents can inspect active scripts and submit refills conversationally.
- **Mise Integration**: Full toolchain and task automation via `mise` for one-command installation, testing, and bundling.
- **GitHub Release Distribution**: Download a single, pre-bundled `my-chart-mcp.js` file with zero repository or npm installation needed.
- **Persistent Session & 2FA Handling**: Launches an interactive browser session once to establish device trust and 2FA; subsequent operations run headlessly in the background.
- **Deterministic Prescription Inspector**: Scrapes and parses active prescriptions, detecting refill eligibility (`isDueSoon`), dosage instructions, authorized prescribers, and target pharmacies.
- **Safe Refill Engine**: Supports dry-run validation (`--dry-run`) before executing actual refill submissions (`--execute`).
- **Configurable Whitelist**: Allows whitelisting specific medication names or order IDs to prevent accidental or unwanted refills.

---

## Zero-Install for Claude Desktop (Download Release)

If you don't want to clone a repository or run build tools:

### 1. Download the Latest Standalone Script
```bash
mkdir -p ~/.config/mychart-refills
curl -fsSL https://github.com/AvogadroSG1/mychartrefills/releases/latest/download/my-chart-mcp.js \
  -o ~/.config/mychart-refills/my-chart-mcp.js
```

### 2. Configure Claude Desktop
Add to your `claude_desktop_config.json`:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mychart-refills": {
      "command": "node",
      "args": [
        "~/.config/mychart-refills/my-chart-mcp.js"
      ]
    }
  }
}
```

### 3. Restart Claude Desktop
You can now ask Claude Desktop:
- *"Check my MyChart session"*
- *"Log in to MyChart"*
- *"What prescriptions do I have due for refill?"*
- *"Refill my medications"*

---

## Developer Quick Start (with `mise`)

If you have [mise](https://mise.jdx.dev/) installed:

```bash
# 1. Install toolchains, npm dependencies & Playwright browsers
mise run setup

# 2. Install CLI to ~/.local/bin (available anywhere on $PATH)
mise run install:cli

# 3. (Optional) Auto-configure Claude Desktop with MCP server
mise run install:desktop

# 4. Authenticate MyChart (one-time interactive 2FA)
mise run auth

# 5. List prescriptions & check refill eligibility
mise run list
```

---

## Standard Setup (without `mise`)

### 1. Install Dependencies
```bash
npm install
npx playwright install chromium
```

### 2. Global Linking
To make `mychart-refills` available in your terminal:
```bash
npm link
```
*(Or use `./bin/mychart-refills` directly).*

### 3. Authenticate with MyChart
```bash
./bin/mychart-refills auth --login
```
Once logged in, the session and device trust cookies are stored securely in `~/.config/mychart-refills/browser-profile`.

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

## Running Tests & Packaging

```bash
# Run unit & coverage test suites
mise run test

# Package standalone release bundle
mise run package
```
