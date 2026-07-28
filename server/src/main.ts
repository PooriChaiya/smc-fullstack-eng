import 'reflect-metadata' // required for Nest DI paramtype metadata (esp. under tsx/esbuild)
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import cookieParser from 'cookie-parser'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.use(cookieParser())
  app.enableCors({ origin: ['http://localhost:5173', 'http://localhost:5174'], credentials: true })
  await app.listen(3001)
  console.log('Server listening on http://localhost:3001')
}
bootstrap()
