import { createHash } from 'node:crypto';

export const yamlRelease = Object.freeze({
  version: '2.9.1',
  url: 'https://registry.npmjs.org/yaml/-/yaml-2.9.1.tgz',
  integrity: 'sha512-3NxN8+78OdzbT7C/WjGsyfPAtJaN3FNDsWxv7Y7mcDsT/oOmgW8BpyQQFFBnvZE3j9Y2Sdz1ULFLezL7Eb2yFw==',
  gitHead: '1440ecd3d1bff41e4ac399f8f6839e810328bd16',
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Backport the upstream index-based flow scalar unfolding approach:
// https://github.com/eemeli/yaml/blob/1420d2dbfecf43f89ff1bc6b3ca6e90db538155d/src/compose/resolve-flow-scalar.ts
function unfoldLines(source) {
  let newline = source.indexOf('\n');
  if (newline === -1) return source;
  let end = newline;
  if (source[end - 1] === '\r') --end;
  while (end > 0 && (source[end - 1] === ' ' || source[end - 1] === '\t')) --end;
  const parts = [source.slice(0, end)];
  let separator = ' ';
  let position = newline + 1;
  while ((newline = source.indexOf('\n', position)) !== -1) {
    let start = position;
    while (start < newline && (source[start] === ' ' || source[start] === '\t')) ++start;
    end = newline;
    if (source[end - 1] === '\r') --end;
    while (end > start && (source[end - 1] === ' ' || source[end - 1] === '\t')) --end;
    if (start === end) {
      if (separator === '\n') parts.push(separator);
      else separator = '\n';
    } else {
      parts.push(separator, source.slice(start, end));
      separator = ' ';
    }
    position = newline + 1;
  }
  while (position < source.length && (source[position] === ' ' || source[position] === '\t')) ++position;
  parts.push(separator, source.slice(position));
  return parts.join('');
}

function indentBlockEndNewlines(source, indent) {
  const parts = [];
  let from = 0;
  let start = source.indexOf('\n');
  while (start !== -1) {
    let end = start + 1;
    while (source[end] === '\n') ++end;
    if (end === source.length) break;
    parts.push(source.slice(from, end), indent);
    from = end;
    start = source.indexOf('\n', end);
  }
  parts.push(source.slice(from));
  return parts.join('');
}

function removeFoldSeparators(source) {
  const parts = [];
  let from = 0;
  let start = 0;
  let whitespaceEnd = 0;
  while (start < source.length) {
    if (source[start] !== ' ' && source[start] !== '\t') {
      const newline = source.indexOf('\n', start);
      if (newline === -1) break;
      start = newline + 1;
      continue;
    }
    let bodyEnd = start + 1;
    while (bodyEnd < source.length) {
      const ch = source[bodyEnd];
      if (ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029') break;
      ++bodyEnd;
    }
    // Cache the end of each whitespace run. Without this, many indented empty
    // lines would repeatedly rescan the same suffix and remain quadratic.
    if (bodyEnd >= whitespaceEnd) {
      whitespaceEnd = bodyEnd;
      while (whitespaceEnd < source.length) {
        const ch = source[whitespaceEnd];
        if (ch !== '\n' && ch !== '\t' && ch !== ' ') break;
        ++whitespaceEnd;
      }
    }
    const matchEnd = whitespaceEnd > bodyEnd && source[whitespaceEnd - 1] === '\n' ? whitespaceEnd : bodyEnd;
    parts.push(source.slice(from, start === 0 ? 0 : start - 1), source.slice(start, bodyEnd));
    if (matchEnd > bodyEnd) parts.push(source.slice(bodyEnd, matchEnd - 1));
    from = matchEnd;
    const newline = source.indexOf('\n', matchEnd);
    if (newline === -1) break;
    start = newline + 1;
  }
  parts.push(source.slice(from));
  return parts.join('');
}

export function hardenYaml(upstream) {
  const files = { ...upstream }, patches = [];
  const patch = (file, expectedSha256, description, apply) => {
    const before = files[file];
    if (!Buffer.isBuffer(before) || sha256(before) !== expectedSha256)
      throw Error('Unexpected upstream YAML bytes; review the patch before upgrading: ' + file);
    files[file] = Buffer.from(apply(before.toString('utf8')));
    patches.push({ file, description, upstreamSha256: expectedSha256, patchedSha256: sha256(files[file]) });
  };
  patch('dist/compose/resolve-flow-scalar.js', '13bcd9d37afd4ffec4b1b3bc9ae1ecc2cff97e7f7c91b5f58b71c99ddd526b05',
    'Backport upstream linear flow-scalar unfolding; remove backtracking and legacy-engine fallbacks.', source => {
      const start = source.indexOf('function unfoldLines(source) {');
      const end = source.indexOf('function doubleQuotedValue(', start);
      if (start < 0 || end < 0) throw Error('Missing YAML unfolding patch anchors');
      return source.slice(0, start) + unfoldLines.toString() + '\n' + source.slice(end);
    });
  patch('dist/stringify/stringifyString.js', '4113b71a9c4c087a197f71452794a6acb9929111f569c973ff4efe7caee8f777',
    'Replace trailing-newline and more-indented block folding expressions with linear scanners.', source => {
      const start = source.indexOf('// The negative lookbehind avoids a polynomial search,');
      const end = source.indexOf('function blockString(', start);
      if (start < 0 || end < 0) throw Error('Missing YAML block-scalar patch anchors');
      source = source.slice(0, start) + indentBlockEndNewlines.toString() + '\n' + removeFoldSeparators.toString() + '\n' + source.slice(end);
      const trailing = 'end = end.replace(blockEndNewlines, `$&${indent}`);';
      if (!source.includes(trailing)) throw Error('Missing YAML block-end call');
      source = source.replace(trailing, 'end = indentBlockEndNewlines(end, indent);');
      const folded = source.indexOf('const foldedValue = value');
      const next = source.indexOf('let literalFallback = false;', folded);
      if (folded < 0 || next < 0) throw Error('Missing YAML indented folding call');
      return source.slice(0, folded) + "const foldedValue = removeFoldSeparators(value.replace(/\\n+/g, '\\n$&'))\n            .replace(/\\n+/g, `$&${indent}`);\n        " + source.slice(next);
    });
  return { files, patches };
}
