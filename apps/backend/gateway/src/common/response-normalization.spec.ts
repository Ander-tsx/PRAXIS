/// <reference types="jest" />

import type { INestApplication } from '@nestjs/common';
import {
    Body,
    Controller,
    Get,
    HttpStatus,
    Module,
    NotFoundException,
    Post,
    UnauthorizedException,
    ValidationPipe,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request from 'supertest';
import { StandardExceptionFilter } from './filters/standard-exception.filter';
import { StandardResponseInterceptor } from './interceptors/standard-response.interceptor';

class CreateThingDto {
  @IsString()
  name!: string;
}

@Controller('test')
class TestController {
  @Get()
  getHello() {
    return { ok: true, message: 'hello' };
  }

  @Post()
  create(@Body() body: CreateThingDto) {
    return { created: true, body };
  }

  @Get('not-found')
  notFound() {
    throw new NotFoundException('Resource not found');
  }

  @Get('unauthorized')
  unauthorized() {
    throw new UnauthorizedException('Unauthorized');
  }

  /**
   * Reproduce lo que llega cuando un microservicio lanza RpcException sobre
   * TCP: el ClientProxy rechaza con el objeto plano ya deserializado, no con
   * la instancia de RpcException.
   */
  @Get('rpc-conflict')
  rpcConflict() {
    throw { statusCode: HttpStatus.CONFLICT, message: 'El email ya está registrado' };
  }

  @Get('rpc-unauthorized')
  rpcUnauthorized() {
    throw { statusCode: HttpStatus.UNAUTHORIZED, message: 'Credenciales inválidas' };
  }
}

@Module({
  controllers: [TestController],
})
class TestModule {}

describe('response normalization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalInterceptors(new StandardResponseInterceptor());
    app.useGlobalFilters(new StandardExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('wraps successful responses in the standard envelope', async () => {
    const response = await request(app.getHttpServer()).get('/test').expect(HttpStatus.OK);

    expect(response.body).toEqual({
      success: true,
      data: { ok: true, message: 'hello' },
      meta: {},
    });
  });

  it('wraps validation errors in the standard error envelope', async () => {
    const response = await request(app.getHttpServer()).post('/test').send({}).expect(HttpStatus.BAD_REQUEST);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Validation failed',
        details: {
          errors: expect.any(Array),
        },
      },
    });
  });

  it('wraps not found errors in the standard error envelope', async () => {
    const response = await request(app.getHttpServer()).get('/test/not-found').expect(HttpStatus.NOT_FOUND);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Resource not found',
        details: {},
      },
    });
  });

  it('wraps unauthorized errors in the standard error envelope', async () => {
    const response = await request(app.getHttpServer()).get('/test/unauthorized').expect(HttpStatus.UNAUTHORIZED);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        details: {},
      },
    });
  });

  it('preserves the status of a serialized RpcException instead of degrading it to 500', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/rpc-conflict')
      .expect(HttpStatus.CONFLICT);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'El email ya está registrado',
        details: {},
      },
    });
  });

  it('preserves the status of a serialized RpcException for auth errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/rpc-unauthorized')
      .expect(HttpStatus.UNAUTHORIZED);

    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Credenciales inválidas',
        details: {},
      },
    });
  });
});
