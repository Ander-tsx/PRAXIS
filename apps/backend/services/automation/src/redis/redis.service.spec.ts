/// <reference types="jest" />

import { RedisService } from './redis.service';

describe('RedisService consumer metrics', () => {
  it('separa el lag del grupo de sus entregas pendientes', async () => {
    const service = new RedisService({} as never);
    (service as unknown as { client: unknown }).client = {
      xpending: jest.fn(async () => [3, '1-0', '3-0', []]),
      xinfo: jest.fn(async () => [['name', 'automation', 'pending', 3, 'lag', 7]]),
    };

    await expect(service.getConsumerMetrics('praxis:domain-events', 'automation')).resolves.toEqual(
      {
        lag: 7,
        pending: 3,
      },
    );
  });
});
