import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe('Command Scheduler API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DB_PATH = ':memory:';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('schedules, polls, and completes a command', async () => {
    const deviceId = 'd_42';

    const scheduled = await request(app.getHttpServer())
      .post(`/devices/${deviceId}/commands`)
      .send({ type: 'PING', params: { hello: 'world' } })
      .expect(201);

    expect(scheduled.body.commandId).toBeDefined();
    expect(scheduled.body.status).toBe('PENDING');

    const polled = await request(app.getHttpServer())
      .post(`/devices/${deviceId}/commands/poll`)
      .expect(200);

    expect(polled.body.commandId).toBe(scheduled.body.commandId);
    expect(polled.body.status).toBe('LEASED');

    const completed = await request(app.getHttpServer())
      .post(`/commands/${scheduled.body.commandId}/complete`)
      .send({ status: 'SUCCEEDED', output: { durationMs: 12 } })
      .expect(200);

    expect(completed.body.commandId).toBe(scheduled.body.commandId);
    expect(completed.body.status).toBe('SUCCEEDED');
    expect(completed.body.completedAt).toBeDefined();
  });

  it('supports idempotent scheduling via Idempotency-Key', async () => {
    const deviceId = 'd_idem';
    const key = 'test-key-1';

    const r1 = await request(app.getHttpServer())
      .post(`/devices/${deviceId}/commands`)
      .set('Idempotency-Key', key)
      .send({ type: 'REBOOT', params: { reason: 'manual' } })
      .expect(201);

    const r2 = await request(app.getHttpServer())
      .post(`/devices/${deviceId}/commands`)
      .set('Idempotency-Key', key)
      .send({ type: 'REBOOT', params: { reason: 'manual' } })
      .expect(201);

    expect(r2.body.commandId).toBe(r1.body.commandId);
  });

  it('expires commands via TTL (not delivered after expiry)', async () => {
    const deviceId = 'd_ttl';

    await request(app.getHttpServer())
      .post(`/devices/${deviceId}/commands`)
      .send({ type: 'COLLECT_LOGS', ttlSeconds: 1 })
      .expect(201);

    await sleep(1200);

    await request(app.getHttpServer())
      .post(`/devices/${deviceId}/commands/poll`)
      .expect(204);
  });
});
