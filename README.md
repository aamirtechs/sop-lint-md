# sop-lint-md
Live page: https://aamirtechs.github.io/sop-lint-md/

Lint Markdown SOPs and runbooks for operations content, not style: missing owner, version or review date, overdue reviews, vague steps like promptly or as needed, steps with no verb, and broken internal links.

## Why

An SOP fails in operations terms, not grammar terms. Nobody owns it, the review date passed eight months ago, a step says to handle something promptly, and the linked procedure was renamed last quarter. Style linters catch none of that. This tool reads a folder of Markdown procedures and reports the failures that actually hurt at 2 a.m., each one with the file and line number.

## Install

Requires Node.js 20 or later. There are no dependencies.

```bash
git clone https://github.com/aamirtechs/sop-lint-md.git
cd sop-lint-md
node src/cli.js --help
```

You can also link the CLI globally from the cloned folder:

```bash
npm link
sop-lint-md ./sops --out-dir output
```

## Usage

```bash
node src/cli.js <folder> [--out-dir DIR] [--config config.json] [--reference-date YYYY-MM-DD]
```

- The folder is scanned recursively for `.md` files.
- Output is `report.md` and `findings.csv` in the output directory.
- Config JSON keys are `requiredFields`, `vagueTerms`, and `referenceDate`. The `--reference-date` flag overrides config and exists mainly so reviews can be judged against a fixed date in tests and CI. Without it, today is used.

### Header format

Front matter is the primary format. Put a block like this at the very top of each file:

```markdown
---
owner: Sam Example
version: 1.4
review date: 2026-06-01
department: Customer Support
---
```

Accepted review date keys are `review date`, `review_date`, and `last reviewed`, plus the same spellings with underscores or no space. A simple header table at the top of the file, with rows such as `| Owner | Sam Example |`, is read as a fallback when front matter is missing.

### Rules

- Missing metadata. Each required field that a file does not declare is one finding. Defaults are owner, version, reviewDate, and department, named that way in config.
- Overdue review. A review date before the reference date is flagged with the exact number of days overdue. An unparseable review date is flagged as invalid instead.
- Vague terms. A built in dictionary that includes promptly, as needed, soon, regularly, appropriate, handle it, as soon as possible, periodically, and similar phrases. Each match is flagged with its line number. Config replaces the whole list.
- Steps with no verb. Numbered and bulleted steps whose first word is not a verb are flagged. The check uses a small built in verb list plus an -ing and -s heuristic, and is deliberately conservative. It would rather miss a weak step than flag a good one, and a one word line is never treated as a step.
- Broken internal links. Relative Markdown links whose target file does not exist are flagged. Web and mail links and in-page anchors are skipped, and an anchor suffix on a file link is ignored for the existence check.

## Example

The example folder holds two SOPs. `examples/sops/refund-processing.md`:

```markdown
---
owner: Sam Example
version: 1.4
review date: 2026-06-01
department: Customer Support
---

# Refund Processing

## Steps

1. Open the billing console for the account.
2. Verify the charge against the invoice.
3. The refund thing on the screen.
4. Handle it promptly and close the case as needed.
5. Send the confirmation message to the customer.

See the [escalation guide](escalation-guide.md) for exceptions.
See the [legacy fax process](legacy-fax-process.md) for fax orders.
```

And `examples/sops/escalation-guide.md`, which uses `last reviewed` instead of `review date` and has no department:

```markdown
---
owner: Lee Example
version: 2.0
last reviewed: 2027-01-15
---

# Escalation Guide

## Steps

1. Review the ticket history.
2. Escalate the case to the duty lead.
3. Document the outcome in the ticket.

Check the shared drive regularly for updates.
```

The example config, from `examples/config.json`, pins the reference date so the output is stable:

```json
{
  "requiredFields": ["owner", "version", "reviewDate", "department"],
  "referenceDate": "2026-10-22"
}
```

Real run:

```bash
node src/cli.js examples/sops --config examples/config.json --out-dir output
```

Real output:

```text
Files checked: 2
Total findings: 8
  broken-link: 1
  missing-metadata: 1
  overdue-review: 1
  step-no-verb: 1
  vague-term: 4
Wrote report.md and findings.csv to output
```

The generated `findings.csv`:

```csv
file,line,rule,message
escalation-guide.md,1,missing-metadata,Missing required field: department
escalation-guide.md,15,vague-term,"Vague term ""regularly"": Check the shared drive regularly for updates."
refund-processing.md,1,overdue-review,Review date 2026-06-01 is 143 days overdue
refund-processing.md,14,step-no-verb,Step does not start with a verb: 3. The refund thing on the screen.
refund-processing.md,15,vague-term,"Vague term ""promptly"": 4. Handle it promptly and close the case as needed."
refund-processing.md,15,vague-term,"Vague term ""as needed"": 4. Handle it promptly and close the case as needed."
refund-processing.md,15,vague-term,"Vague term ""handle it"": 4. Handle it promptly and close the case as needed."
refund-processing.md,19,broken-link,Internal link target does not exist: legacy-fax-process.md
```

The generated `report.md`:

```markdown
# SOP Lint Report

## Summary

- Files checked: 2
- Total findings: 8
- Reference date: 2026-10-22

## Per-file summary

| File | Owner | Version | Review date | Department | Findings |
| --- | --- | --- | --- | --- | --- |
| escalation-guide.md | Lee Example | 2.0 | 2027-01-15 |  | 2 |
| refund-processing.md | Sam Example | 1.4 | 2026-06-01 | Customer Support | 6 |

## Findings

- escalation-guide.md:1 [missing-metadata] Missing required field: department
- escalation-guide.md:15 [vague-term] Vague term "regularly": Check the shared drive regularly for updates.
- refund-processing.md:1 [overdue-review] Review date 2026-06-01 is 143 days overdue
- refund-processing.md:14 [step-no-verb] Step does not start with a verb: 3. The refund thing on the screen.
- refund-processing.md:15 [vague-term] Vague term "promptly": 4. Handle it promptly and close the case as needed.
- refund-processing.md:15 [vague-term] Vague term "as needed": 4. Handle it promptly and close the case as needed.
- refund-processing.md:15 [vague-term] Vague term "handle it": 4. Handle it promptly and close the case as needed.
- refund-processing.md:19 [broken-link] Internal link target does not exist: legacy-fax-process.md
```

## Library use

```js
const { lintFolder, findingsCsv, renderReport } = require('./src');

const result = lintFolder('./sops', { referenceDate: '2026-10-22' });
console.log(result.findings.length);
console.log(findingsCsv(result.findings));
```

## Tests

```bash
npm test
```

Tests use the built in Node.js test runner and cover front matter and header table parsing, missing fields, exact overdue day counts, vague terms with line numbers, config overrides for terms and required fields, verb detection, broken link detection, and the CLI end to end.

## Contributing

See GFIs.md for seeded good first issues.

## License

MIT. Copyright (c) 2026 Amir Hussain. See LICENSE.
