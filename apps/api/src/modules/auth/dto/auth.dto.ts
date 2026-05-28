import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@easyedu.vn' })
  @IsNotEmpty()
  @IsString()
  username: string; // Can be email, phone, or username

  @ApiProperty({ example: 'Password@123' })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  rememberMe?: boolean;
}

export class RegisterDto {
  @ApiProperty({ enum: ['TEACHER', 'STUDENT'] })
  @IsEnum(['TEACHER', 'STUDENT'])
  role: 'TEACHER' | 'STUDENT';

  @ApiProperty({ example: 'Nguyễn Văn An' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ example: '0901234567' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({ example: 'student@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password@123', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password: string;

  // Teacher-only fields
  @ApiPropertyOptional({ type: [String], example: ['Toán', 'Lý'] })
  @IsOptional()
  @IsString({ each: true })
  subjectsTaught?: string[];

  @ApiPropertyOptional({ type: [String], example: ['6', '7', '8'] })
  @IsOptional()
  @IsString({ each: true })
  gradesHandled?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  experienceDesc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idCardNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  // Student-only fields
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guardianName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guardianPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guardianRelation?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: '0901234567 or email@example.com' })
  @IsNotEmpty()
  @IsString()
  identifier: string; // email or phone
}

export class VerifyOtpDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  otp: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  otp: string;

  @ApiProperty({ minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  confirmPassword: string;
}
