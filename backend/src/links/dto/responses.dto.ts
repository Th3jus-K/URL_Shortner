import { ApiProperty, ApiSchema } from '@nestjs/swagger';

const SHORT_CODE_REGEX = '^[A-Za-z0-9]{7}$';

@ApiSchema({ name: 'ShortenResponse' })
export class ShortenResponseDto {
  @ApiProperty({ pattern: SHORT_CODE_REGEX, example: 'Ab3xY9z' })
  short_code!: string;

  @ApiProperty({
    description: 'PUBLIC_BASE_URL + /r/ + short_code (points at the NestJS server, not Vite)',
    example: 'http://localhost:9010/r/Ab3xY9z',
  })
  short_url!: string;

  @ApiProperty({ example: 'https://example.com/article' })
  original_url!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-12T10:00:00Z' })
  created_at!: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-13T10:00:00Z' })
  expires_at!: string;

  @ApiProperty()
  reused!: boolean;
}

@ApiSchema({ name: 'HourBucket' })
export class HourBucketDto {
  @ApiProperty({ format: 'date-time', description: 'Start of the UTC hour, e.g. 2026-10-12T13:00:00Z' })
  hour!: string;

  @ApiProperty({ type: 'integer', minimum: 0 })
  clicks!: number;
}

@ApiSchema({ name: 'AnalyticsResponse' })
export class AnalyticsResponseDto {
  @ApiProperty({ example: 'Ab3xY9z' })
  short_code!: string;

  @ApiProperty({ example: 'https://example.com/article' })
  original_url!: string;

  @ApiProperty({ example: 'http://localhost:9010/r/Ab3xY9z' })
  short_url!: string;

  @ApiProperty({ format: 'date-time' })
  created_at!: string;

  @ApiProperty({ format: 'date-time' })
  expires_at!: string;

  @ApiProperty({ type: 'integer', minimum: 0 })
  total_clicks!: number;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  last_clicked_at!: string | null;

  @ApiProperty({ type: [HourBucketDto], minItems: 24, maxItems: 24 })
  clicks_by_hour!: HourBucketDto[];
}

@ApiSchema({ name: 'Error' })
export class ErrorResponseDto {
  @ApiProperty({ example: 'Short URL not found' })
  detail!: string;
}
