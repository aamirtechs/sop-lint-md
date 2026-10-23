'use strict';

const { toCsv } = require('./csv');

const DEFAULT_REQUIRED_FIELDS = ['owner', 'version', 'reviewDate', 'department'];

const FIELD_ALIASES = {
  owner: ['owner'],
  version: ['version'],
  reviewDate: ['review date', 'reviewdate', 'review_date', 'last reviewed', 'lastreviewed', 'last_reviewed'],
  department: ['department', 'dept'],
};

const DEFAULT_VAGUE_TERMS = [
  'promptly',
  'as needed',
  'as soon as possible',
  'soon',
  'regularly',
  'appropriate',
  'appropriately',
  'handle it',
  'in a timely manner',
  'periodically',
  'occasionally',
  'when possible',
  'if necessary',
  'and so on',
  'etc',
];

const VERBS = new Set([
  'add', 'approve', 'archive', 'assign', 'attach', 'call', 'check', 'click',
  'close', 'collect', 'complete', 'confirm', 'contact', 'copy', 'create',
  'delete', 'disable', 'document', 'download', 'edit', 'enable', 'ensure',
  'enter', 'escalate', 'file', 'fill', 'follow', 'forward', 'gather', 'go',
  'handle',
  'inspect', 'install', 'invite', 'lock', 'log', 'mark', 'merge', 'monitor',
  'notify', 'open', 'pay', 'post', 'prepare', 'print', 'process', 'publish',
  'read', 'record', 'remove', 'reply', 'resolve', 'respond', 'restart',
  'review', 'run', 'save', 'schedule', 'search', 'select', 'send', 'set',
  'share', 'start', 'stop', 'submit', 'tag', 'test', 'track', 'turn',
  'update', 'upload', 'use', 'validate', 'verify', 'watch', 'write',
]);

function normalizeKey(key) {
  return String(key).trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function canonicalField(key) {
  const norm = normalizeKey(key).replace(/\s+/g, ' ');
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const normalizedAliases = aliases.map((a) => normalizeKey(a).replace(/\s+/g, ' '));
    if (normalizedAliases.includes(norm)) return field;
  }
  return null;
}

// Front matter: a leading --- block with "key: value" lines.
// Fallback: a simple header table near the top, rows like "| Owner | Sam |".
function parseMetadata(text) {
  const meta = {};
  const lines = String(text).split(/\r?\n/);
  if (lines[0] && lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i += 1) {
      if (lines[i].trim() === '---') break;
      const match = lines[i].match(/^([^:]+):\s*(.+?)\s*$/);
      if (match) {
        const field = canonicalField(match[1]);
        if (field) meta[field] = match[2].replace(/^["']|["']$/g, '');
      }
    }
    if (Object.keys(meta).length > 0) return meta;
  }
  const limit = Math.min(lines.length, 40);
  for (let i = 0; i < limit; i += 1) {
    const row = lines[i].trim();
    if (!row.startsWith('|')) continue;
    const cells = row.split('|').map((c) => c.trim()).filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    const field = canonicalField(cells[0]);
    if (field && !/^-+$/.test(cells[1])) meta[field] = cells[1];
  }
  return meta;
}

function isVerbWord(word) {
  if (VERBS.has(word)) return true;
  if (word.endsWith('ing') && word.length > 4) return true;
  if (word.endsWith('s') && word.length > 3 && !word.endsWith('ss')) return true;
  return false;
}

function firstWordOfStep(line) {
  const match = String(line).match(/^\s*(?:[-*+]|\d+[.)])\s+(.+)$/);
  if (!match) return null;
  const cleaned = match[1]
    .replace(/^\*\*(.+?)\*\*/, '$1')
    .replace(/`/g, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  return words[0].toLowerCase().replace(/[^a-z'-]/g, '');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDateOnly(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolveLinkPath(relPath, filePart) {
  let target = String(filePart || '').replace(/\\/g, '/');
  const isAbs = target.startsWith('/');
  if (isAbs) target = target.slice(1);
  const dir = String(relPath || '').replace(/\\/g, '/').split('/').slice(0, -1);
  const parts = isAbs ? [] : dir.slice();
  for (const seg of target.split('/')) {
    if (!seg || seg === '.') continue;
    else if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

function lintContent(relPath, text, options, baseDir) {
  const opts = options || {};
  const requiredFields = opts.requiredFields || DEFAULT_REQUIRED_FIELDS;
  const vagueTerms = opts.vagueTerms || DEFAULT_VAGUE_TERMS;
  const referenceDate = opts.referenceDate
    ? parseDateOnly(opts.referenceDate)
    : (() => {
        const now = new Date();
        return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      })();

  const findings = [];
  const add = (line, rule, message) => findings.push({ file: relPath, line, rule, message });
  const meta = parseMetadata(text);

  for (const field of requiredFields) {
    if (!meta[field]) add(1, 'missing-metadata', 'Missing required field: ' + field);
  }

  if (meta.reviewDate) {
    const review = parseDateOnly(meta.reviewDate);
    if (!review) {
      add(1, 'invalid-review-date', 'Review date is not a YYYY-MM-DD date: ' + meta.reviewDate);
    } else if (referenceDate && review < referenceDate) {
      const days = Math.floor((referenceDate - review) / 86400000);
      add(1, 'overdue-review', 'Review date ' + meta.reviewDate + ' is ' + days + ' days overdue');
    }
  }

  const lines = String(text).split(/\r?\n/);
  const vaguePatterns = vagueTerms.map((term) => ({
    term,
    re: new RegExp('\\b' + escapeRegex(term) + '\\b', 'i'),
  }));
  lines.forEach((lineText, idx) => {
    const lineNo = idx + 1;
    for (const { term, re } of vaguePatterns) {
      if (re.test(lineText)) {
        add(lineNo, 'vague-term', 'Vague term "' + term + '": ' + lineText.trim());
      }
    }
    const first = firstWordOfStep(lineText);
    if (first && !isVerbWord(first)) {
      add(lineNo, 'step-no-verb', 'Step does not start with a verb: ' + lineText.trim());
    }
    const linkRe = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let linkMatch;
    while ((linkMatch = linkRe.exec(lineText)) !== null) {
      const target = linkMatch[1];
      if (/^(https?:|mailto:|#)/i.test(target)) continue;
      const filePart = decodeURIComponent(target.split('#')[0]);
      if (!filePart) continue;
      let exists;
      if (opts.existingFiles || typeof opts.fileExists === 'function') {
        const pure = resolveLinkPath(relPath, filePart);
        if (typeof opts.fileExists === 'function') exists = !!opts.fileExists(pure);
        else {
          const set = opts.existingFiles instanceof Set ? opts.existingFiles : new Set(opts.existingFiles);
          exists = set.has(pure);
        }
      } else {
        const fs = require('fs');
        const path = require('path');
        const root = path.resolve(baseDir || '.');
        const candidate = path.isAbsolute(filePart)
          ? filePart
          : path.resolve(root, path.dirname(relPath), filePart);
        exists = fs.existsSync(candidate);
      }
      if (!exists) {
        add(lineNo, 'broken-link', 'Internal link target does not exist: ' + target);
      }
    }
  });

  return { file: relPath, metadata: meta, findings };
}

function collectMarkdownFiles(dir) {
  const fs = require('fs');
  const path = require('path');
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...collectMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function lintFolder(dir, options) {
  const fs = require('fs');
  const path = require('path');
  const files = collectMarkdownFiles(dir);
  const results = files.map((full) => {
    const rel = path.relative(dir, full);
    const text = fs.readFileSync(full, 'utf8');
    return lintContent(rel, text, options, dir);
  });
  const findings = results.flatMap((r) => r.findings);
  findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule)
  );
  return { fileCount: files.length, results, findings };
}

function lintFiles(files, options) {
  const list = (files || [])
    .map((f) => ({
      rel: String((f && (f.path || f.name)) || '').replace(/\\/g, '/').replace(/^\.\//, ''),
      text: f && typeof f.content === 'string' ? f.content : '',
    }))
    .filter((f) => f.rel.toLowerCase().endsWith('.md'));
  list.sort((a, b) => a.rel.localeCompare(b.rel));
  const existingFiles = new Set(list.map((f) => f.rel));
  const opts = { ...(options || {}), existingFiles };
  const results = list.map((f) => lintContent(f.rel, f.text, opts, '.'));
  const findings = results.flatMap((r) => r.findings);
  findings.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule)
  );
  return { fileCount: list.length, results, findings };
}

function findingsCsv(findings) {
  const rows = [['file', 'line', 'rule', 'message']];
  for (const f of findings) rows.push([f.file, f.line, f.rule, f.message]);
  return toCsv(rows);
}

function renderReport(result, options) {
  const opts = options || {};
  const lines = [];
  lines.push('# SOP Lint Report');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('- Files checked: ' + result.fileCount);
  lines.push('- Total findings: ' + result.findings.length);
  if (opts.referenceDate) lines.push('- Reference date: ' + opts.referenceDate);
  lines.push('');
  lines.push('## Per-file summary');
  lines.push('');
  lines.push('| File | Owner | Version | Review date | Department | Findings |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const r of result.results) {
    const m = r.metadata;
    lines.push(
      '| ' + r.file + ' | ' + (m.owner || '') + ' | ' + (m.version || '') + ' | ' +
        (m.reviewDate || '') + ' | ' + (m.department || '') + ' | ' + r.findings.length + ' |'
    );
  }
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  if (result.findings.length === 0) lines.push('None.');
  else {
    for (const f of result.findings) {
      lines.push('- ' + f.file + ':' + f.line + ' [' + f.rule + '] ' + f.message);
    }
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  DEFAULT_REQUIRED_FIELDS,
  DEFAULT_VAGUE_TERMS,
  VERBS,
  parseMetadata,
  isVerbWord,
  firstWordOfStep,
  lintContent,
  resolveLinkPath,
  collectMarkdownFiles,
  lintFolder,
  lintFiles,
  findingsCsv,
  renderReport,
};
