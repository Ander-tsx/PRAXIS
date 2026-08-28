/// <reference types="jest" />

import { INestMicroservice } from '@nestjs/common';
import { ClientProxyFactory, MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { firstValueFrom } from 'rxjs';
import { AutomationHealthModule } from './automation-health.module';

describe('automation-service health TCP', () => {
  let app: INestMicroservice;
  let client: ReturnType<typeof ClientProxyFactory.create>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AutomationHealthModule],
    }).compile();
    app = moduleRef.createNestMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: 3018 },
    });
    await app.listen();
    client = ClientProxyFactory.create({
      transport: Transport.TCP,
      options: { host: '127.0.0.1', port: 3018 },
    });
  });

  afterAll(async () => {
    await client?.close();
    await app?.close();
  });

  it('responde al patrón TCP de salud', async () => {
    await expect(firstValueFrom(client.send({ cmd: 'automation_health' }, {}))).resolves.toEqual({
      status: 'ok',
    });
  });
});
