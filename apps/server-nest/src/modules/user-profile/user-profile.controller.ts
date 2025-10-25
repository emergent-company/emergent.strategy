import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards, UsePipes, ValidationPipe, HttpCode } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { UserProfileService } from './user-profile.service';
import { ApiBadRequestResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { UpdateUserProfileDto, UserProfileDto, AddAlternativeEmailDto, AlternativeEmailDto } from './dto/profile.dto';
import { Scopes } from '../auth/scopes.decorator';

@ApiTags('UserProfile')
@Controller('user/profile')
@UseGuards(AuthGuard, ScopesGuard)
export class UserProfileController {
    constructor(private readonly profiles: UserProfileService) { }

    @Get()
    @ApiOkResponse({ type: UserProfileDto })
    @ApiStandardErrors()
    async getSelf(@Req() req: any) {
        const userId: string | undefined = req?.user?.id; // Use internal UUID
        if (!userId) return null;
        return this.profiles.getById(userId); // Use getById for UUID lookup
    }

    @Put()
    @ApiOkResponse({ type: UserProfileDto })
    @ApiBadRequestResponse({ description: 'Validation error' })
    @ApiStandardErrors()
    async updateSelf(@Req() req: any, @Body() dto: UpdateUserProfileDto) {
        const userId: string | undefined = req?.user?.id; // Use internal UUID
        return this.profiles.update(userId!, dto);
    }

    @Get('emails')
    @ApiOkResponse({ type: AlternativeEmailDto, isArray: true })
    @ApiStandardErrors()
    async listEmails(@Req() req: any) {
        const userId: string | undefined = req?.user?.id; // Use internal UUID
        return this.profiles.listAlternativeEmails(userId!);
    }

    @Post('emails')
    @HttpCode(200)
    @ApiOkResponse({ type: AlternativeEmailDto })
    @ApiStandardErrors()
    async addEmail(@Req() req: any, @Body() dto: AddAlternativeEmailDto) {
        const userId: string | undefined = req?.user?.id; // Use internal UUID
        return this.profiles.addAlternativeEmail(userId!, dto.email);
    }

    @Delete('emails/:email')
    @ApiOkResponse({ schema: { example: { status: 'deleted' } } })
    @ApiStandardErrors()
    async removeEmail(@Req() req: any, @Param('email') email: string) {
        const userId: string | undefined = req?.user?.id; // Use internal UUID
        return this.profiles.deleteAlternativeEmail(userId!, decodeURIComponent(email));
    }
}
