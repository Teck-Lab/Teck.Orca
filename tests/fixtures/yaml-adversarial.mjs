import assert from 'node:assert/strict';

// Exercise the legacy-engine path as well as the normal Node path. Before the
// vendor patch, unsupported lookbehind selected the vulnerable fallback regexes.
const NativeRegExp = globalThis.RegExp;
if (process.argv[3] !== 'native') {
  function WithoutLookbehind(pattern, flags) {
    if (String(pattern).includes('(?<')) throw new SyntaxError('Lookbehind unavailable');
    return new NativeRegExp(pattern, flags);
  }
  WithoutLookbehind.prototype = NativeRegExp.prototype;
  Object.setPrototypeOf(WithoutLookbehind, NativeRegExp);
  globalThis.RegExp = WithoutLookbehind;
}
const { default: YAML } = await import('../../runtime/kubernetes/vendor/yaml/dist/index.js');
const size = process.env.TECK_YAML_PUMP ? Number(process.env.TECK_YAML_PUMP) : 200_000;
assert.ok(Number.isSafeInteger(size) && size > 0 && size <= 500_000);
switch (process.argv[2]) {
  case 'first-line': {
    const value = '\t'.repeat(size);
    assert.equal(YAML.parse("'" + value + "'"), value);
    break;
  }
  case 'subsequent-line':
    assert.equal(YAML.parse("'first\n" + '\t'.repeat(size) + "last'"), 'first last');
    break;
  case 'block-end': {
    const value = 'content' + '\n'.repeat(size);
    assert.equal(YAML.parse(YAML.stringify(value, { blockQuote: 'literal', lineWidth: 0 })), value);
    break;
  }
  case 'indented-folds': {
    const value = '\tfirst\n' + '\t\n'.repeat(size) + '\tlast';
    assert.equal(YAML.parse(YAML.stringify(value, { blockQuote: 'folded', lineWidth: 0 })), value);
    break;
  }
  default: throw Error('Unknown adversarial YAML fixture');
}
console.log('OK');
