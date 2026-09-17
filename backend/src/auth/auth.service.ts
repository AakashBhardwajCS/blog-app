import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';

type PublicUser = { id: string; email: string; name: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private publicUser(user: PublicUser): PublicUser {
    return user;
  }

  private async token(user: PublicUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email });
  }

  async register(dto: RegisterDto): Promise<{ token: string; user: PublicUser }> {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (exists) throw new ConflictException('Email is already registered');

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        password: await bcrypt.hash(dto.password, 12),
      },

      select: { id: true, email: true, name: true },
    });

    return { token: await this.token(user), user: this.publicUser(user) };
  }

  async login(dto: LoginDto): Promise<{ token: string; user: PublicUser }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });

    if (!user || !(await bcrypt.compare(dto.password, user.password)))
      throw new UnauthorizedException('Invalid email or password');

    const publicUser = this.publicUser(user);

    return { token: await this.token(publicUser), user: publicUser };
  }

  async me(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true },
    });

    if (!user) throw new UnauthorizedException();

    return user;
  }
}
