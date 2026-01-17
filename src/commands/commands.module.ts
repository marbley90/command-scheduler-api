import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Command } from './command.entity';
import { CommandsController } from './commands.controller';
import { CommandsService } from './commands.service';

@Module({
  imports: [TypeOrmModule.forFeature([Command])],
  controllers: [CommandsController],
  providers: [CommandsService],
  exports: [CommandsService]
})
export class CommandsModule {}
