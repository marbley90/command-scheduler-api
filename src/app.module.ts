import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommandsModule } from './commands/commands.module';
import { Command } from './commands/command.entity';
import { RedisModule } from './config/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'sqlite',
        database: cfg.get<string>('DB_PATH') ?? 'data.sqlite',
        entities: [Command],
        synchronize: true
      })
    }),
    RedisModule,
    CommandsModule
  ]
})
export class AppModule {}
