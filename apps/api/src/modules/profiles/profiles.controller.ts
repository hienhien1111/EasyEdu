import {
  Controller,
  Get,
  Patch,
  Body,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GuardianRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ProfilesService } from './profiles.service';

class UpdateTeacherProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() idCardFrontUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idCardBackUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idCardNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() salaryQrCodeUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarUrl?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  subjectsTaught?: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  gradesHandled?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() experienceDesc?: string;
}

class UpdateStudentProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() avatarUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() grade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() school?: string;
  @ApiPropertyOptional({ enum: GuardianRole })
  @IsOptional()
  @IsEnum(GuardianRole)
  guardianRole?: GuardianRole;
  @ApiPropertyOptional() @IsOptional() @IsString() guardianName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() guardianPhone?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  guardianDateOfBirth?: string;
}

class VerifyProfilePasswordDto {
  @ApiProperty() @IsNotEmpty() @IsString() password: string;
}

class UploadTeacherSalaryQrDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fileName?: string;
  @ApiProperty() @IsNotEmpty() @IsString() dataUrl: string;
}

@ApiTags('Profile - Thông tin cá nhân')
@ApiBearerAuth()
@Controller('profile')
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Post('verify-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác minh mật khẩu trước khi xem hồ sơ cá nhân' })
  async verifyPassword(
    @CurrentUser() user: any,
    @Body() dto: VerifyProfilePasswordDto,
  ) {
    return this.profilesService.verifyPassword(user.id, dto.password);
  }

  @Get()
  @ApiOperation({ summary: 'Xem thông tin cá nhân (UC-20)' })
  async getProfile(@CurrentUser() user: any) {
    return this.profilesService.getProfile(user);
  }

  @Get('teacher/completion')
  @ApiOperation({ summary: 'Trạng thái hoàn thiện hồ sơ giáo viên' })
  async getTeacherProfileCompletion(@CurrentUser() user: any) {
    return this.profilesService.getTeacherProfileCompletion(user.id);
  }

  @Get('teacher')
  @ApiOperation({ summary: 'Xem hồ sơ giáo viên (UC-20)' })
  async getTeacherProfile(@CurrentUser() user: any) {
    return this.profilesService.getTeacherProfile(user.id);
  }

  @Get('student')
  @ApiOperation({ summary: 'Xem hồ sơ học sinh (UC-20)' })
  async getStudentProfile(@CurrentUser() user: any) {
    return this.profilesService.getStudentProfile(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Cập nhật thông tin cơ bản (UC-20)' })
  async updateBaseProfile(@CurrentUser() user: any, @Body() body: any) {
    return this.profilesService.updateBaseProfile(user, body);
  }

  @Patch('teacher')
  @ApiOperation({ summary: 'Cập nhật hồ sơ giáo viên (UC-20)' })
  async updateTeacherProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateTeacherProfileDto,
  ) {
    return this.profilesService.updateTeacherProfile(user.id, dto);
  }

  @Post('teacher/salary-qr')
  @ApiOperation({ summary: 'Giáo viên upload ảnh QR nhận lương' })
  async uploadTeacherSalaryQr(
    @CurrentUser() user: any,
    @Body() dto: UploadTeacherSalaryQrDto,
  ) {
    return this.profilesService.uploadTeacherSalaryQr(user.id, dto);
  }

  @Patch('student')
  @ApiOperation({ summary: 'Cập nhật hồ sơ học sinh (UC-20)' })
  async updateStudentProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    return this.profilesService.updateStudentProfile(user.id, dto);
  }
}
