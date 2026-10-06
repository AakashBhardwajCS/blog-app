import { Body, Controller, Delete, Get, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import { JwtPayload } from '../auth/jwt.strategy';
import { UpdateProfileDto } from './dto';
import { ProfileService } from './profile.service';

/** Largest accepted profile picture; multer rejects bigger uploads with 413 before they reach the service. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** The signed-in user's own profile. */
@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.profile.get(user.sub);
  }

  @Patch()
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.profile.update(user.sub, dto);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } }))
  uploadAvatar(@CurrentUser() user: JwtPayload, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.profile.setAvatar(user.sub, file);
  }

  @Delete('avatar')
  removeAvatar(@CurrentUser() user: JwtPayload) {
    return this.profile.removeAvatar(user.sub);
  }
}
