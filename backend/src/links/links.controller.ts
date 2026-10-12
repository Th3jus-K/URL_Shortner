import { Body, Controller, Get, GoneException, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SHORT_CODE_PARAM } from './api-docs';
import { AnalyticsResponseDto, ErrorResponseDto, ShortenResponseDto } from './dto/responses.dto';
import { ShortenUrlDto } from './dto/shorten-url.dto';
import { AnalyticsResult, LinksService, ShortenResult } from './links.service';

@ApiTags('links')
@Controller()
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Post('api/shorten')
  @ApiOperation({
    summary: 'Create a short link, or renew the active one for the same URL',
    description:
      'The submitted url is trimmed of surrounding whitespace and otherwise compared as an exact string. If an ' +
      'active link exists for it, that link is renewed (expires_at = now + 24h, code, created_at and analytics ' +
      'unchanged) and 200 is returned. Otherwise a new link with a new code is created and 201 is returned.',
  })
  @ApiResponse({ status: 201, description: 'New short link created', type: ShortenResponseDto })
  @ApiResponse({ status: 200, description: 'Active link reused and its expiration renewed', type: ShortenResponseDto })
  @ApiResponse({
    status: 422,
    description:
      'Invalid input: missing/empty/non-string url, scheme other than http/https, no valid hostname, ' +
      'whitespace/control characters inside the URL, or longer than 2048 characters (after trimming).',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 500, description: 'Unexpected failure (no internal details exposed)', type: ErrorResponseDto })
  shorten(@Body() dto: ShortenUrlDto, @Res({ passthrough: true }) res: Response): ShortenResult {
    const result = this.links.shorten(dto.url);
    res.status(result.reused ? 200 : 201);
    return result;
  }

  @Get('api/links/:shortCode/analytics')
  @ApiOperation({
    summary: 'Aggregate analytics for a short link',
    description:
      'Public, read-only; never renews expiration. total_clicks covers all clicks since creation, including ' +
      'before renewals. clicks_by_hour has exactly 24 entries in ascending order: the current UTC hour and ' +
      'the preceding 23, with 0 for hours without clicks.',
  })
  @ApiParam(SHORT_CODE_PARAM)
  @ApiOkResponse({ description: 'Analytics', type: AnalyticsResponseDto })
  @ApiResponse({ status: 404, description: 'Unknown or malformed short code', type: ErrorResponseDto })
  @ApiResponse({ status: 410, description: 'Short link expired', type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Unexpected failure (no internal details exposed)', type: ErrorResponseDto })
  analytics(@Param('shortCode') code: string): AnalyticsResult {
    const result = this.links.getAnalytics(code);
    if (result.status === 'not_found') throw new NotFoundException('Short URL not found');
    if (result.status === 'expired') throw new GoneException('This shortened URL has expired');
    return result.analytics;
  }
}
