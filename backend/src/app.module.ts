import { Module } from '@nestjs/common';
import { AuthService } from './auth/auth.service';
import { FeesService } from './fees/fees.service';
import { ResultsService } from './results/results.service';
import { ContinuityService } from './continuity/continuity.service';

@Module({
  imports: [],
  controllers: [],
  providers: [
    AuthService,
    FeesService,
    ResultsService,
    ContinuityService
  ],
  exports: [
    AuthService,
    FeesService,
    ResultsService,
    ContinuityService
  ]
})
export class AppModule {}
