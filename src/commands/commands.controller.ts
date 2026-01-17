import {
  Body,
  Controller,
  Param,
  Post, Req,
  Res
} from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiNoContentResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { CommandsService } from './commands.service';
import { CommandResponseDto, CompletionResponseDto, LeasedCommandResponseDto } from './dto/command-response.dto';
import { ScheduleCommandDto } from './dto/schedule-command.dto';
import { CompleteCommandDto } from './dto/complete-command.dto';

@ApiTags('commands')
@Controller()
export class CommandsController {
  constructor(private readonly svc: CommandsService) {}

  @Post('/devices/:deviceId/commands')
  @ApiOperation({ summary: 'Schedule a command for a device' })
  @ApiParam({ name: 'deviceId' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Optional key to make scheduling idempotent across retries',
  })
  @ApiCreatedResponse({ type: CommandResponseDto })
  async schedule(
      @Param('deviceId') deviceId: string,
      @Body() dto: ScheduleCommandDto,
      @Req() req: Request,
  ): Promise<CommandResponseDto> {
    const idempotencyKey = req.header('Idempotency-Key') ?? undefined;

    const cmd = await this.svc.scheduleCommand(deviceId, dto, idempotencyKey);
    return {
      commandId: cmd.id,
      deviceId: cmd.deviceId,
      type: cmd.type,
      params: cmd.params,
      status: cmd.status,
      createdAt: cmd.createdAt.toISOString(),
    };
  }

  @Post('/devices/:deviceId/commands/poll')
  @ApiOperation({ summary: 'Poll for next command (oldest pending). Atomically leases for 60 seconds.' })
  @ApiParam({ name: 'deviceId' })
  @ApiOkResponse({ type: LeasedCommandResponseDto })
  @ApiNoContentResponse({ description: 'No eligible command' })
  async poll(
    @Param('deviceId') deviceId: string,
    @Res() res: Response
  ): Promise<void> {
    const cmd = await this.svc.pollNextCommand(deviceId);
    if (!cmd) {
      res.status(204).send();
      return;
    }

    res.status(200).json({
      commandId: cmd.id,
      deviceId: cmd.deviceId,
      type: cmd.type,
      params: cmd.params,
      status: cmd.status,
      leasedAt: cmd.leasedAt?.toISOString(),
      leaseExpiresAt: cmd.leaseExpiresAt?.toISOString()
    });
  }

  @Post('/commands/:commandId/complete')
  @ApiOperation({ summary: 'Report completion of a leased command' })
  @ApiParam({ name: 'commandId' })
  @ApiOkResponse({ type: CompletionResponseDto })
  async complete(
    @Param('commandId') commandId: string,
    @Body() dto: CompleteCommandDto
  ): Promise<CompletionResponseDto> {
    const cmd = await this.svc.completeCommand(commandId, dto);
    return {
      commandId: cmd.id,
      status: dto.status,
      completedAt: cmd.completedAt!.toISOString()
    };
  }
}
