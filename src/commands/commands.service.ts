import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { addSeconds } from 'date-fns';
import { Repository } from 'typeorm';
import { REDIS } from '../config/redis.module';
import { Command, CommandStatus, CommandType } from './command.entity';
import { ScheduleCommandDto } from './dto/schedule-command.dto';
import { CompleteCommandDto, CompletionStatus } from './dto/complete-command.dto';
import Redis from 'ioredis';

const IDEMPOTENCY_LONG_TTL_SECONDS = 60 * 60 * 24;
const IDEMPOTENCY_LOCK_TTL_SECONDS = 30;
const LEASE_SECONDS = 60;

@Injectable()
export class CommandsService {
  constructor(
    @InjectRepository(Command) private readonly repo: Repository<Command>,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  private idempotencyRedisKey(deviceId: string, key: string) {
    return `idempotency:${deviceId}:${key}`;
  }

  async scheduleCommand(deviceId: string, dto: ScheduleCommandDto, idempotencyKey?: string): Promise<Command> {
    if (!idempotencyKey) {
      return this.createCommand(deviceId, dto);
    }

    const redisKey = this.idempotencyRedisKey(deviceId, idempotencyKey);

    // Claim the idempotency key first to avoid duplicates.
    const lockValue = `inprog:${randomUUID()}`;
    const setResult = await this.redis.set(
        redisKey,
        lockValue,
        'EX',
        IDEMPOTENCY_LOCK_TTL_SECONDS,
        'NX',
    );


    if (setResult !== 'OK') {
      // Someone already claimed it. Return existing command if available.
      const existing = await this.redis.get(redisKey);
      if (existing && !existing.startsWith('inprog:')) {
        const cmd = await this.repo.findOne({ where: { id: existing, deviceId } });
        if (cmd) return cmd;
      }
      throw new ConflictException('Idempotency-Key is already in progress; please retry');
    }

    try {
      const created = await this.createCommand(deviceId, dto);
      // Replace lock with the created command id and extend TTL.
      await this.redis.set(
          redisKey,
          created.id,
          'EX',
          IDEMPOTENCY_LONG_TTL_SECONDS,
          'XX',
      );

      return created;
    } catch (e) {
      // Best-effort cleanup: free the key so caller can retry.
      const current = await this.redis.get(redisKey);
      if (current === lockValue) {
        await this.redis.del(redisKey);
      }
      throw e;
    }
  }

  private async createCommand(deviceId: string, dto: ScheduleCommandDto): Promise<Command> {
    const now = new Date();
    const cmd = this.repo.create({
      deviceId,
      type: dto.type as CommandType,
      params: dto.params,
      status: CommandStatus.PENDING,
      ttlSeconds: dto.ttlSeconds ?? null,
      expiresAt: dto.ttlSeconds ? addSeconds(now, dto.ttlSeconds) : null
    });
    return this.repo.save(cmd);
  }

  /**
   * Polling behavior:
   * - Expire TTL'd commands inline (no background job)
   * - Release expired leases inline
   * - Atomically lease oldest pending command
   */
  async pollNextCommand(deviceId: string): Promise<Command | null> {
    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = await this.repo.manager.transaction(async (em) => {
        const now = new Date();

        // 1) Expire commands that exceeded TTL and are not terminal.
        await em
          .createQueryBuilder()
          .update(Command)
          .set({ status: CommandStatus.EXPIRED })
          .where('status IN (:...active)', { active: [CommandStatus.PENDING, CommandStatus.LEASED] })
          .andWhere('expiresAt IS NOT NULL')
          .andWhere('expiresAt <= :now', { now })
          .execute();

        // 2) Release expired leases.
        await em
          .createQueryBuilder()
          .update(Command)
          .set({ status: CommandStatus.PENDING, leasedAt: null, leaseExpiresAt: null })
          .where('status = :leased', { leased: CommandStatus.LEASED })
          .andWhere('leaseExpiresAt IS NOT NULL')
          .andWhere('leaseExpiresAt <= :now', { now })
          .andWhere('(expiresAt IS NULL OR expiresAt > :now)', { now })
          .execute();

        // 3) Find oldest pending eligible command.
        const candidate = await em
          .createQueryBuilder(Command, 'c')
          .where('c.deviceId = :deviceId', { deviceId })
          .andWhere('c.status = :pending', { pending: CommandStatus.PENDING })
          .andWhere('(c.expiresAt IS NULL OR c.expiresAt > :now)', { now })
          .orderBy('c.createdAt', 'ASC')
          .getOne();

        if (!candidate) return null;

        const leasedAt = now;
        const leaseExpiresAt = addSeconds(now, LEASE_SECONDS);

        // 4) Atomic lease: update only if still pending.
        const upd = await em
          .createQueryBuilder()
          .update(Command)
          .set({
            status: CommandStatus.LEASED,
            leasedAt,
            leaseExpiresAt
          })
          .where('id = :id', { id: candidate.id })
          .andWhere('status = :pending', { pending: CommandStatus.PENDING })
          .execute();

        if ((upd.affected ?? 0) !== 1) {
          // Lost race; retry outer loop.
          return undefined;
        }

        return em.findOneOrFail(Command, { where: { id: candidate.id } });
      });

      if (result === undefined) continue;
      return result;
    }

    return null;
  }

  async completeCommand(commandId: string, dto: CompleteCommandDto): Promise<Command> {
    const cmd = await this.repo.findOne({ where: { id: commandId } });
    if (!cmd) throw new NotFoundException('Command not found');

    const now = new Date();

    // TTL check: if expired and not terminal, mark expired.
    if (cmd.expiresAt && cmd.expiresAt <= now && ![CommandStatus.SUCCEEDED, CommandStatus.FAILED].includes(cmd.status)) {
      if (cmd.status !== CommandStatus.EXPIRED) {
        cmd.status = CommandStatus.EXPIRED;
        await this.repo.save(cmd);
      }
      throw new ConflictException('Command TTL expired');
    }

    if (cmd.status !== CommandStatus.LEASED) {
      throw new ConflictException('Command is not currently leased');
    }

    if (!cmd.leaseExpiresAt || cmd.leaseExpiresAt <= now) {
      throw new ConflictException('Command lease expired');
    }

    cmd.status = dto.status === CompletionStatus.SUCCEEDED ? CommandStatus.SUCCEEDED : CommandStatus.FAILED;
    cmd.completedAt = now;
    cmd.output = dto.output;
    cmd.leasedAt = null;
    cmd.leaseExpiresAt = null;

    return this.repo.save(cmd);
  }
}
