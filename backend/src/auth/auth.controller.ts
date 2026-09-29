  import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
  import { AuthService } from './auth.service';
  import { CurrentUser, JwtAuthGuard } from './guards';
  import { JwtPayload } from './jwt.strategy';
  import { LoginDto, RegisterDto } from './dto';

  @Controller('auth')
  export class AuthController {

    // injecting the AuthService into the controller to use its methods for handling authentication requests
    constructor(private readonly auth: AuthService) {}

    @Post('register') register(@Body() dto: RegisterDto) {
      // method to handle user registration, it takes a RegisterDto object from the request body and passes it to the AuthService's register method
      return this.auth.register(dto);
    }

    @Post('login') login(@Body() dto: LoginDto) {
      // method to handle user login, it takes a LoginDto object from the request body and passes it to the AuthService's login method
      return this.auth.login(dto);
    }
    // The me method is a protected route that requires a valid JWT token to access. It uses the JwtAuthGuard to ensure that only authenticated users can access this route.
    // The custom CurrentUser decorator is used to extract the user information from the request object, which is then passed to the AuthService's me method to retrieve the user's information based on their ID (sub).
    @UseGuards(JwtAuthGuard) @Get('me') me(@CurrentUser() user: JwtPayload) {
      return this.auth.me(user.sub);
    }
  }
