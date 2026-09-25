import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto';

type PublicUser = { id: string; email: string; name: string; tenantId: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'tenant';
  }

  private publicUser(user: PublicUser): PublicUser {
    return user;
  }

  private async token(user: PublicUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email, tenantId: user.tenantId });
  }

  async register(dto: RegisterDto): Promise<{ token: string; user: PublicUser }> {
    
    const email = dto.email.toLowerCase();
    const tenantSlug = (dto.tenantSlug ?? this.slugify(dto.tenantName ?? dto.name)).toLowerCase();

    const tenant = await this.prisma.tenant.upsert({
      where: { slug: tenantSlug },
      create: {
        name: dto.tenantName ?? `${dto.name}'s Organization`,
        slug: tenantSlug,
      },
      update: {},
    });

    const exists = await this.prisma.user.findFirst({ where: { tenantId: tenant.id, email } });
    if (exists) throw new ConflictException('Email is already registered for this tenant');

    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        name: dto.name,
        password: await bcrypt.hash(dto.password, 12),
      },
      select: { id: true, tenantId: true, email: true, name: true },
    });

    return { token: await this.token(user), user: this.publicUser(user) };
  }

  async login(dto: LoginDto): Promise<{ token: string; user: PublicUser }> {
    const email = dto.email.toLowerCase();
    const tenantSlug = dto.tenantSlug ? dto.tenantSlug.toLowerCase() : undefined;

    let tenantId: string | undefined;
    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
      if (!tenant) throw new UnauthorizedException('Tenant was not found');
      tenantId = tenant.id;
    }

    const matches = await this.prisma.user.findMany({
      where: { email, ...(tenantId ? { tenantId } : {}) },
      select: { id: true, tenantId: true, email: true, name: true, password: true },
    });

    if (matches.length > 1) {
      throw new UnauthorizedException('Multiple tenants match this email. Please provide tenantSlug.');
    }

    const user = matches[0];
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const publicUser = this.publicUser({ id: user.id, tenantId: user.tenantId, email: user.email, name: user.name });

    return { token: await this.token(publicUser), user: publicUser };
  }

  async me(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, tenantId: true, email: true, name: true },
    });

    if (!user) throw new UnauthorizedException();

    return user;
  }
}
