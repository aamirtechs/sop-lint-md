#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { lintFolder, findingsCsv, renderReport } = require('./lint');

function usage() {
  return [
    'Usage: sop-lint-md <folder> [--out-dir DIR] [--config config.json] [--reference-date YYYY-MM-DD]',
    '',
    'Config JSON keys: requiredFields, vagueTerms, referenceDate.',
    'requiredFields uses the canonical names owner, version, reviewDate, department.',
    'Writes report.md and findings.csv into the output directory.',
  ].join('\n');
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(usage());
    return args.length === 0 ? 1 : 0;
  }
  let input = null;
  let outDir = '.';
  let config = {};
  const overrides = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out-dir') outDir = args[++i];
    else if (args[i] === '--config') config = JSON.parse(fs.readFileSync(args[++i], 'utf8'));
    else if (args[i] === '--reference-date') overrides.referenceDate = args[++i];
    else if (!args[i].startsWith('--')) input = args[i];
    else throw new Error('Unknown option: ' + args[i]);
  }
  if (!input) throw new Error('Missing folder path.\n' + usage());
  if (!fs.existsSync(input) || !fs.statSync(input).isDirectory()) {
    throw new Error('Not a directory: ' + input);
  }
  const options = { ...config, ...overrides };
  const result = lintFolder(input, options);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.md'), renderReport(result, options));
  fs.writeFileSync(path.join(outDir, 'findings.csv'), findingsCsv(result.findings));
  console.log('Files checked: ' + result.fileCount);
  console.log('Total findings: ' + result.findings.length);
  const byRule = {};
  for (const f of result.findings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;
  for (const rule of Object.keys(byRule).sort()) {
    console.log('  ' + rule + ': ' + byRule[rule]);
  }
  console.log('Wrote report.md and findings.csv to ' + outDir);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv);
  } catch (err) {
    console.error('Error: ' + err.message);
    process.exitCode = 1;
  }
}

module.exports = { main };
