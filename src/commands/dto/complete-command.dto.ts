import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum CompletionStatus {
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED'
}

export class CompleteCommandDto {
  @ApiProperty({ enum: CompletionStatus })
  @IsEnum(CompletionStatus)
  status!: CompletionStatus;

  @ApiPropertyOptional({ description: 'Optional output (text or JSON)' })
  @IsOptional()
  output?: unknown;
}
