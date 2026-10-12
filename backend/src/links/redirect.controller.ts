import { Controller, Get, GoneException, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SHORT_CODE_PARAM } from './api-docs';
import { ErrorResponseDto } from './dto/responses.dto';
import { LinksService } from './links.service';

@ApiTags('links')
@Controller()
export class RedirectController {
  constructor(private readonly links: LinksService) {}

  @Get('r/:shortCode')
  @ApiOperation({
    summary: 'Redirect to the original URL and record one click',
    description:
      'Does not renew expiration. Sent with Cache-Control no-store. Only a successful redirect counts as a ' +
      'click. A code that is not exactly 7 letters/digits is treated as unknown (404).',
  })
  @ApiParam(SHORT_CODE_PARAM)
  @ApiResponse({
    status: 302,
    description: 'Redirect to the original URL',
    headers: {
      Location: { description: 'The stored original URL', schema: { type: 'string' } },
      'Cache-Control': { schema: { type: 'string', example: 'no-store' } },
    },
  })
  @ApiResponse({ status: 404, description: 'Unknown or malformed short code (no click recorded)', type: ErrorResponseDto })
  @ApiResponse({ status: 410, description: 'Short link expired (no redirect, no click recorded)', type: ErrorResponseDto })
  @ApiResponse({ status: 500, description: 'Unexpected failure (no internal details exposed)', type: ErrorResponseDto })
  redirect(@Param('shortCode') code: string, @Res() res: Response): void {
    const result = this.links.recordClick(code);
    if (result.status === 'not_found') throw new NotFoundException('Short URL not found');
    if (result.status === 'expired') throw new GoneException('This shortened URL has expired');
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, result.originalUrl);
  }
}
