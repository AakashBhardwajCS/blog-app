import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser, JwtAuthGuard } from './guards';
import { JwtPayload } from './jwt.strategy';
import { LoginDto, RegisterDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register') register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Post('login') login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
  @UseGuards(JwtAuthGuard) @Get('me') me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user.sub);
  }
}
