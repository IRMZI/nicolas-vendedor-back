import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthService } from './auth.service';

@Injectable()
export class AuthTasks {
  constructor(private readonly authService: AuthService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupTokens() {
    await this.authService.purgeExpiredTokens();
  }
}
