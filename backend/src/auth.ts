import {
  BadRequestException, Body, CanActivate, Controller, ExecutionContext, Get, Injectable, Post,
  UnauthorizedException, UseGuards, createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from './entities';

/** Pustí ďalej len požiadavky s platným prihlasovacím tokenom (hlavička Authorization: Bearer ...) */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwt: JwtService) {}

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    try {
      req.userId = this.jwt.verify(String(req.headers.authorization).replace('Bearer ', '')).sub;
      return true;
    } catch {
      throw new UnauthorizedException('Prihláste sa, prosím');
    }
  }
}

/** ID prihláseného používateľa */
export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().userId);

@Controller('auth')
export class AuthController {
  constructor(@InjectRepository(User) private users: Repository<User>, private jwt: JwtService) {}

  private session(user: User) {
    return { token: this.jwt.sign({ sub: user.id }), user: { id: user.id, name: user.name, email: user.email } };
  }

  @Post('register')
  async register(@Body() body: { name?: string; email?: string; password?: string }) {
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    if (!name || !email?.includes('@')) throw new BadRequestException('Vyplňte meno a platný e-mail');
    if (!body.password || body.password.length < 10) throw new BadRequestException('Heslo musí mať aspoň 10 znakov');
    if (await this.users.findOneBy({ email })) throw new BadRequestException('Účet s týmto e-mailom už existuje');

    const user = await this.users.save({ name, email, passwordHash: await bcrypt.hash(body.password, 10) });
    return this.session(user as User);
  }

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    const user = await this.users.findOne({
      where: { email: body.email?.trim().toLowerCase() ?? '' },
      select: { id: true, name: true, email: true, passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(body.password ?? '', user.passwordHash))) {
      throw new UnauthorizedException('Nesprávny e-mail alebo heslo');
    }
    return this.session(user);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@UserId() userId: string) {
    return this.users.findOneByOrFail({ id: userId });
  }
}
