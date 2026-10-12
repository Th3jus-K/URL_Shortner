import { Global, Module } from '@nestjs/common';
import { CLOCK, SystemClock } from './clock';
import { CODE_GENERATOR, generateShortCode } from './short-code';

@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: CODE_GENERATOR, useValue: generateShortCode },
  ],
  exports: [CLOCK, CODE_GENERATOR],
})
export class CommonModule {}
