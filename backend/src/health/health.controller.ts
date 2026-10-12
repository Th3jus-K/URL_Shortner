import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  @ApiOkResponse({
    description: 'Service is up',
    schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', example: 'ok' } } },
  })
  health(): { status: string } {
    return { status: 'ok' };
  }
}
