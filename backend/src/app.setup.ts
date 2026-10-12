import { INestApplication, UnprocessableEntityException, ValidationError, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/http-exception.filter';

function firstConstraintMessage(errors: ValidationError[]): string {
  for (const error of errors) {
    if (error.constraints) {
      const first = Object.values(error.constraints)[0];
      if (first) return first;
    }
    if (error.children?.length) {
      const nested = firstConstraintMessage(error.children);
      if (nested) return nested;
    }
  }
  return 'Invalid request';
}

/** Shared by main.ts and the test harness so both run with identical configuration. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      errorHttpStatusCode: 422,
      exceptionFactory: (errors) => new UnprocessableEntityException(firstConstraintMessage(errors)),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('URL Shortener with Analytics')
    .setDescription(
      'Anonymous URL shortener. All endpoints are public. Timestamps are UTC strings formatted ' +
        'YYYY-MM-DDTHH:mm:ssZ. Every error body is {"detail": "<message>"}.',
    )
    .setVersion('1.0.0')
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  app.enableShutdownHooks();
}
