import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController, AuthGuard } from './auth';
import { GoogleAccount, Task, User } from './entities';
import { GoogleController, GoogleService } from './google';
import { TasksController } from './tasks';

const entities = [User, Task, GoogleAccount];

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ulohy',
      entities,
      synchronize: true, // prototyp: tabuľky sa vytvoria automaticky podľa entít
    }),
    TypeOrmModule.forFeature(entities),
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET ?? 'tajny-kluc-prototypu', signOptions: { expiresIn: '7d' } }),
  ],
  controllers: [AuthController, TasksController, GoogleController],
  providers: [AuthGuard, GoogleService],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(3000);
  console.log('Backend beží na http://localhost:3000/api');
}
bootstrap();
