import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, Validate, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

export const MAX_URL_LENGTH = 2048;
const URL_ERROR = 'url must be a valid http or https URL';

@ValidatorConstraint({ name: 'isHttpUrl', async: false })
export class IsHttpUrlConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    // (a) scheme directly followed by "//" and a non-empty authority start
    if (!/^https?:\/\/[^/?#\\]/i.test(value)) return false;
    // (b) no whitespace or control characters anywhere (non-ASCII is fine)
    if (/[\s\x00-\x1f\x7f]/.test(value)) return false;
    // (c) the WHATWG parser must agree: http(s) with a hostname
    try {
      const parsed = new URL(value);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return URL_ERROR;
  }
}

@ApiSchema({ name: 'ShortenRequest' })
export class ShortenUrlDto {
  @ApiProperty({
    maxLength: MAX_URL_LENGTH,
    description: 'http or https URL with a hostname; surrounding whitespace is trimmed',
    example: 'https://example.com/article',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: URL_ERROR })
  @MaxLength(MAX_URL_LENGTH, { message: `url must be at most ${MAX_URL_LENGTH} characters` })
  @Validate(IsHttpUrlConstraint)
  url!: string;
}
