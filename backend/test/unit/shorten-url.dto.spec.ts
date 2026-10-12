import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ShortenUrlDto } from '../../src/links/dto/shorten-url.dto';

async function check(body: unknown) {
  const dto = plainToInstance(ShortenUrlDto, body);
  const errors = await validate(dto);
  return { dto, errors };
}

const longUrl = (length: number) => 'http://example.com/' + 'a'.repeat(length - 'http://example.com/'.length);

describe('ShortenUrlDto', () => {
  it.each([
    'http://example.com',
    'https://example.com/article?x=1#frag',
    'HTTPS://EXAMPLE.com/Path',
    'http://example.com/café',
    longUrl(2048),
  ])('accepts %s and keeps the value verbatim', async (url) => {
    const { dto, errors } = await check({ url });
    expect(errors).toHaveLength(0);
    expect(dto.url).toBe(url);
  });

  it('trims surrounding whitespace', async () => {
    const { dto, errors } = await check({ url: '  https://example.com/a \n' });
    expect(errors).toHaveLength(0);
    expect(dto.url).toBe('https://example.com/a');
  });

  it.each([
    ['empty', { url: '' }],
    ['whitespace only', { url: '   ' }],
    ['missing', {}],
    ['number', { url: 123 }],
    ['null', { url: null }],
    ['object', { url: { a: 1 } }],
    ['internal space', { url: 'http://example.com/a b' }],
    ['embedded CRLF', { url: 'http://example.com/a\r\nb' }],
    ['tab', { url: 'http://example.com/a\tb' }],
    ['control char', { url: 'http://example.com/a\u0007b' }],
    ['javascript scheme', { url: 'javascript:alert(1)' }],
    ['ftp scheme', { url: 'ftp://example.com/x' }],
    ['no host with path', { url: 'http:///path' }],
    ['no slashes', { url: 'http:example.com' }],
    ['scheme only', { url: 'https://' }],
    ['backslash after scheme', { url: 'http://\\example.com' }],
    ['2049 characters', { url: longUrl(2049) }],
  ])('rejects %s', async (_name, body) => {
    const { errors } = await check(body);
    expect(errors.length).toBeGreaterThan(0);
    const messages = Object.values(errors[0].constraints ?? {});
    expect(messages.length).toBeGreaterThan(0);
  });

  it('measures the 2048 limit after trimming', async () => {
    const { errors } = await check({ url: `  ${longUrl(2048)}  ` });
    expect(errors).toHaveLength(0);
  });
});
