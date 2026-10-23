'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  parseMetadata,
  isVerbWord,
  firstWordOfStep,
  lintContent,
  lintFolder,
  findingsCsv,
} = require('../src/lint');

const OPTS = { referenceDate: '2026-10-22' };

function makeDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'soplint-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const GOOD_HEADER = [
  '---',
  'owner: Sam Example',
  'version: 1.0',
  'review date: 2027-01-01',
  'department: Support',
  '---',
  '',
].join('\n');

test('front matter metadata is parsed, including last reviewed as review date', () => {
  const meta = parseMetadata(
    '---\nowner: Sam Example\nversion: 2.1\nlast reviewed: 2026-05-01\ndepartment: Support\n---\n# Title\n'
  );
  assert.deepEqual(meta, {
    owner: 'Sam Example',
    version: '2.1',
    reviewDate: '2026-05-01',
    department: 'Support',
  });
});

test('header table fallback supplies metadata when front matter is absent', () => {
  const text = [
    '# Refund SOP',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Owner | Lee Example |',
    '| Version | 1.2 |',
    '| Review date | 2027-02-01 |',
    '| Department | Billing |',
    '',
    '1. Check the account.',
  ].join('\n');
  const meta = parseMetadata(text);
  assert.equal(meta.owner, 'Lee Example');
  assert.equal(meta.reviewDate, '2027-02-01');
});

test('missing metadata fields are each reported', () => {
  const dir = makeDir({ 'a.md': '# Bare SOP\n\n1. Check the account.\n' });
  const r = lintFolder(dir, OPTS);
  const missing = r.findings.filter((f) => f.rule === 'missing-metadata');
  assert.equal(missing.length, 4);
});

test('overdue review reports the exact number of days overdue', () => {
  const text = GOOD_HEADER.replace('2027-01-01', '2026-10-01') + '1. Check the account.\n';
  const dir = makeDir({ 'a.md': text });
  const r = lintFolder(dir, OPTS);
  const overdue = r.findings.find((f) => f.rule === 'overdue-review');
  assert.ok(overdue);
  assert.match(overdue.message, /21 days overdue/);
});

test('a future review date is not overdue', () => {
  const dir = makeDir({ 'a.md': GOOD_HEADER + '1. Check the account.\n' });
  const r = lintFolder(dir, OPTS);
  assert.equal(r.findings.filter((f) => f.rule === 'overdue-review').length, 0);
});

test('vague terms are flagged with line numbers', () => {
  const text = GOOD_HEADER + '1. Check the account.\n\nReply promptly and file items as needed.\n';
  const result = lintContent('a.md', text, OPTS, '.');
  const vague = result.findings.filter((f) => f.rule === 'vague-term');
  assert.equal(vague.length, 2);
  assert.ok(vague.every((f) => f.line === 9));
});

test('config can replace the vague term list', () => {
  const text = GOOD_HEADER + 'Reply promptly please.\n';
  const result = lintContent('a.md', text, { ...OPTS, vagueTerms: ['whenever'] }, '.');
  assert.equal(result.findings.filter((f) => f.rule === 'vague-term').length, 0);
});

test('config can change the required fields', () => {
  const text = '---\nowner: Sam Example\n---\n\n1. Check the account.\n';
  const result = lintContent('a.md', text, { ...OPTS, requiredFields: ['owner'] }, '.');
  assert.equal(result.findings.filter((f) => f.rule === 'missing-metadata').length, 0);
});

test('verb detection uses the list plus the -ing and -s heuristics', () => {
  assert.equal(isVerbWord('check'), true);
  assert.equal(isVerbWord('checking'), true);
  assert.equal(isVerbWord('uploads'), true);
  assert.equal(isVerbWord('the'), false);
  assert.equal(isVerbWord('refund'), false);
  assert.equal(firstWordOfStep('1. Verify the charge.'), 'verify');
  assert.equal(firstWordOfStep('- The form on the desk.'), 'the');
  assert.equal(firstWordOfStep('Plain paragraph text.'), null);
});

test('steps whose first word is not a verb are flagged, good steps are not', () => {
  const text =
    GOOD_HEADER + '1. Verify the charge.\n2. The refund form on the desk.\n- Case paperwork for the file.\n';
  const result = lintContent('a.md', text, OPTS, '.');
  const flagged = result.findings.filter((f) => f.rule === 'step-no-verb');
  assert.equal(flagged.length, 2);
});

test('broken internal links are flagged, existing and external links are not', () => {
  const dir = makeDir({
    'a.md':
      GOOD_HEADER +
      'See [the guide](guide.md), [a missing page](missing.md) and [an example](https://example.com/page).\n',
    'guide.md': GOOD_HEADER + '1. Check the account.\n',
  });
  const r = lintFolder(dir, OPTS);
  const broken = r.findings.filter((f) => f.rule === 'broken-link');
  assert.equal(broken.length, 1);
  assert.match(broken[0].message, /missing\.md/);
});

test('CLI writes report.md and findings.csv for a folder', () => {
  const dir = makeDir({ 'a.md': '# Bare SOP\n' });
  const out = path.join(dir, 'out');
  const stdout = execFileSync(
    process.execPath,
    [
      path.join(__dirname, '..', 'src', 'cli.js'),
      dir,
      '--out-dir',
      out,
      '--reference-date',
      '2026-10-22',
    ],
    { encoding: 'utf8' }
  );
  assert.match(stdout, /Files checked: 1/);
  assert.match(fs.readFileSync(path.join(out, 'report.md'), 'utf8'), /SOP Lint Report/);
  assert.match(findingsCsv([{ file: 'a.md', line: 1, rule: 'x', message: 'has, comma' }]), /"has, comma"/);
  assert.match(fs.readFileSync(path.join(out, 'findings.csv'), 'utf8'), /missing-metadata/);
});
