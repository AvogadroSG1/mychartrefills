---
name: mychart-refills
description: Inspect and submit prescription refills through Johns Hopkins MyChart. Use when checking medication status, listing refill-eligible prescriptions, or submitting refills.
---

# MyChart Refills Skill

This skill provides autonomous and interactive workflows to inspect and submit prescription refills on Johns Hopkins MyChart (`mychart.hopkinsmedicine.org`).

## When to Use
- User wants to check what medications or prescriptions are on file.
- User wants to know which prescriptions are due for refill.
- User wants to refill one or all eligible prescriptions.
- Setting up or reviewing medication whitelists and pharmacy preferences.

## Deterministic CLI Location
The automation CLI is located at:
`./bin/mychart-refills` (from repository root) or via global link `npm link && mychart-refills`

## Execution Protocol

### Step 1: Session Verification
Always verify if an active authenticated MyChart session exists:
```bash
./bin/mychart-refills auth --check
```
- If exit code is `0`: Session is active and valid. Proceed to Step 2.
- If exit code is `1`: Session is expired or unauthenticated. Prompt user and run:
  ```bash
  ./bin/mychart-refills auth --login
  ```
  This opens a browser window for the user to complete login and 2FA.

### Step 2: Medication Discovery & Inspection
Query all active medications and refill eligibility:
```bash
./bin/mychart-refills list --json
```
Extract and summarize:
- Order ID (`orderId`)
- Medication Name (`name`)
- Dosage / Sig (`instructions`)
- Authorizing Provider (`provider`)
- Pharmacy (`pharmacy`)
- Refill Status (`isDueSoon`, `statusText`)
- Whitelist Status (`isWhitelisted`)

### Step 3: Interactive Confirmation with User
Present the scripts that are due soon to the user in a clean markdown table or list:
```markdown
| Order ID | Medication | Prescriber | Status | Whitelist |
| :--- | :--- | :--- | :--- | :--- |
| 123456 | Atorvastatin 20mg | Dr. Smith | Refill Due Soon | Whitelisted |
```
Ask the user to confirm which prescriptions they want to refill:
- Refill all due medications
- Refill specific Order ID(s)
- Cancel / skip

### Step 4: Submission Execution
Execute the refill request:
- **Dry-run (default verification)**:
  ```bash
  ./bin/mychart-refills submit --ids <orderId1,orderId2> --dry-run
  ```
- **Real Submission**:
  ```bash
  ./bin/mychart-refills submit --ids <orderId1,orderId2> --execute
  ```
- Or for all due prescriptions:
  ```bash
  ./bin/mychart-refills submit --all-due --execute
  ```

### Step 5: Receipt Reporting
Report the confirmation receipt, pharmacy name, and submission timestamp back to the user.
