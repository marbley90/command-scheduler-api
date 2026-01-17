import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum CommandType {
  PING = 'PING',
  REBOOT = 'REBOOT',
  COLLECT_LOGS = 'COLLECT_LOGS'
}

export enum CommandStatus {
  PENDING = 'PENDING',
  LEASED = 'LEASED',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED'
}

@Entity()
export class Command {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  deviceId!: string;

  @Column({ type: 'text' })
  type!: CommandType;

  @Column({ type: 'simple-json', nullable: true })
  params?: unknown;

  @Column({ type: 'text' })
  status!: CommandStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  leasedAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  leaseExpiresAt?: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt?: Date | null;

  @Column({ type: 'simple-json', nullable: true })
  output?: unknown;

  @Column({ type: 'integer', nullable: true })
  ttlSeconds?: number | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt?: Date | null;
}
