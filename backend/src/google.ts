import { BadRequestException, Controller, Get, Injectable, Query, Res, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { AuthGuard, UserId } from './auth';
import { GoogleAccount, Task, User } from './entities';

/*
 * Prepojenie s Google Calendar cez OAuth 2.0:
 *  1. /api/google/connect  -> adresa súhlasnej obrazovky Google
 *  2. používateľ povolí prístup, Google ho vráti na /api/google/callback?code=...
 *  3. kód vymeníme za access token + refresh token a uložíme ich do databázy
 *  4. s tokenom zapisujeme úlohy ako udalosti do kalendára používateľa
 */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/google/callback';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

@Injectable()
export class GoogleService {
  constructor(@InjectRepository(GoogleAccount) private accounts: Repository<GoogleAccount>) {}

  /** Požiadavka na Google o token (prvý raz z kódu, neskôr obnovenie cez refresh token) */
  private async requestToken(params: Record<string, string>) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
    });
    if (!res.ok) throw new Error(`Google token: ${await res.text()}`);
    return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  }

  async saveTokens(userId: string, code: string) {
    const t = await this.requestToken({ code, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' });
    await this.accounts.delete({ user: { id: userId } });
    await this.accounts.save({
      user: { id: userId } as User,
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? null,
      expiresAt: new Date(Date.now() + t.expires_in * 1000),
    });
  }

  /** Platný access token používateľa, alebo null ak Google nemá prepojený */
  private async accessToken(userId: string) {
    const acc = await this.accounts.findOneBy({ user: { id: userId } });
    if (!acc) return null;
    if (acc.expiresAt.getTime() < Date.now() + 60_000 && acc.refreshToken) {
      const t = await this.requestToken({ refresh_token: acc.refreshToken, grant_type: 'refresh_token' });
      acc.accessToken = t.access_token;
      acc.expiresAt = new Date(Date.now() + t.expires_in * 1000);
      await this.accounts.save(acc);
    }
    return acc.accessToken;
  }

  isConnected(userId: string) {
    return this.accounts.existsBy({ user: { id: userId } });
  }

  /** Zapíše úlohu do kalendára ako 1-hodinovú udalosť. Vráti ID udalosti. */
  async createEvent(userId: string, task: Task): Promise<string | null> {
    const token = await this.accessToken(userId);
    if (!token || !task.dueAt) return null;
    const res = await fetch(CALENDAR_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: task.title,
        description: task.description,
        start: { dateTime: task.dueAt.toISOString() },
        end: { dateTime: new Date(task.dueAt.getTime() + 3600_000).toISOString() },
      }),
    });
    if (!res.ok) throw new Error(`Google Calendar: ${await res.text()}`);
    return ((await res.json()) as { id: string }).id;
  }

  async deleteEvent(userId: string, eventId: string) {
    const token = await this.accessToken(userId);
    if (token) await fetch(`${CALENDAR_URL}/${eventId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }
}

@Controller('google')
export class GoogleController {
  constructor(private google: GoogleService, private jwt: JwtService) {}

  @Get('status')
  @UseGuards(AuthGuard)
  async status(@UserId() userId: string) {
    return { configured: !!CLIENT_ID && !!CLIENT_SECRET, connected: await this.google.isConnected(userId) };
  }

  @Get('connect')
  @UseGuards(AuthGuard)
  connect(@UserId() userId: string) {
    if (!CLIENT_ID || !CLIENT_SECRET) throw new BadRequestException('Chýba GOOGLE_CLIENT_ID alebo GOOGLE_CLIENT_SECRET v súbore .env');
    // state = podpísané ID používateľa, aby sme ho v callbacku spoznali
    const state = this.jwt.sign({ sub: userId }, { expiresIn: '10m' });
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return { url: `${AUTH_URL}?${params}` };
  }

  /** Sem Google vráti používateľa po udelení súhlasu */
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      await this.google.saveTokens(this.jwt.verify(state).sub, code);
      res.redirect(`${FRONTEND_URL}/?google=ok`);
    } catch (e) {
      console.error('Prepojenie s Google zlyhalo:', e);
      res.redirect(`${FRONTEND_URL}/?google=chyba`);
    }
  }
}
