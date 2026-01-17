import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { CommandType } from '../command.entity';

export class ScheduleCommandDto {
  @ApiProperty({ enum: CommandType })
  @IsEnum(CommandType)
  type!: CommandType;

  @ApiPropertyOptional({ description: 'Free-form JSON params' })
  @IsOptional()
  params?: unknown;

  @ApiPropertyOptional({ description: 'Optional TTL in seconds. If the command is not completed before this time, it expires and will not be delivered.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  ttlSeconds?: number;
}
