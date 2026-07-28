import { Module } from '@nestjs/common'
import { FinancialsController } from './financials.controller.js'
import { FinancialsService } from './financials.service.js'
import { SqlValidatorService } from './sql-validator.service.js'

@Module({
  controllers: [FinancialsController],
  providers: [FinancialsService, SqlValidatorService],
  exports: [FinancialsService, SqlValidatorService],
})
export class FinancialsModule {}
