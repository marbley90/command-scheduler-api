import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommandStatus, CommandType } from '../command.entity';

export class CommandResponseDto {
  @ApiProperty()
  commandId!: string;

  @ApiProperty()
  deviceId!: string;

  @ApiProperty({ enum: CommandType })
  type!: CommandType;

  @ApiPropertyOptional({ description: 'Free-form JSON params' })
  params?: unknown;

  @ApiProperty({ enum: CommandStatus })
  status!: CommandStatus;

  @ApiProperty()
  createdAt!: string;
}

export class LeasedCommandResponseDto {
  @ApiProperty()
  commandId!: string;

  @ApiProperty()
  deviceId!: string;

  @ApiProperty({ enum: CommandType })
  type!: CommandType;

  @ApiPropertyOptional()
  params?: unknown;

  @ApiProperty({ enum: CommandStatus })
  status!: CommandStatus;

  @ApiProperty()
  leasedAt!: string;

  @ApiProperty()
  leaseExpiresAt!: string;
}

export class CompletionResponseDto {
  @ApiProperty()
  commandId!: string;

  @ApiProperty({ enum: ['SUCCEEDED', 'FAILED'] })
  status!: 'SUCCEEDED' | 'FAILED';

  @ApiProperty()
  completedAt!: string;
}
