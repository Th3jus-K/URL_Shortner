import { SHORT_CODE_PATTERN, generateShortCode } from '../../src/common/short-code';

describe('short codes', () => {
  it('generates 7 characters from [A-Za-z0-9]', () => {
    const code = generateShortCode();
    expect(code).toHaveLength(7);
    expect(code).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('10 000 generated codes all match SHORT_CODE_PATTERN', () => {
    for (let i = 0; i < 10_000; i++) {
      expect(SHORT_CODE_PATTERN.test(generateShortCode())).toBe(true);
    }
  });

  it('pattern rejects wrong lengths and non-alphanumerics', () => {
    expect(SHORT_CODE_PATTERN.test('abcdef')).toBe(false);
    expect(SHORT_CODE_PATTERN.test('abcdefgh')).toBe(false);
    expect(SHORT_CODE_PATTERN.test('abc-123')).toBe(false);
    expect(SHORT_CODE_PATTERN.test('ab-defg')).toBe(false);
    expect(SHORT_CODE_PATTERN.test('abcdef\n')).toBe(false);
    expect(SHORT_CODE_PATTERN.test('Ab3xY9z')).toBe(true);
  });
});
