import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { publicUserSelect, PublicUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeaweedService } from '../storage/seaweed.service';
import { UpdateProfileDto } from './dto';

/** Raster formats we accept, identified by their file signature ("magic bytes"). */
const IMAGE_SIGNATURES: Array<{ mimeType: string; matches: (bytes: Buffer) => boolean }> = [
  { mimeType: 'image/jpeg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimeType: 'image/png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimeType: 'image/gif', matches: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  { mimeType: 'image/webp', matches: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SeaweedService,
  ) {}

  async get(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  update(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    return this.prisma.user.update({ where: { id: userId }, data: dto, select: publicUserSelect });
  }

  /**
   * Stores a new profile picture and points the user at it. The type is checked from
   * the file's bytes rather than the client-supplied MIME type, and SVG is rejected
   * because it can carry scripts. The previous image is left in storage.
   */
  async setAvatar(userId: string, file: Express.Multer.File | undefined): Promise<PublicUser> {
    if (!file) throw new BadRequestException('An image file is required');
    const format = IMAGE_SIGNATURES.find((signature) => signature.matches(file.buffer));
    if (!format) throw new BadRequestException('Profile pictures must be JPEG, PNG, GIF or WebP images');

    const { url } = await this.storage.uploadFile({ ...file, mimetype: format.mimeType }, 'avatars');
    return this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: url }, select: publicUserSelect });
  }

  removeAvatar(userId: string): Promise<PublicUser> {
    return this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: null }, select: publicUserSelect });
  }
}
