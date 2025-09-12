import { Controller, Get, Param, NotFoundException, UseInterceptors, Post, Body, HttpCode } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiBadRequestResponse, ApiNotFoundResponse, ApiCreatedResponse, ApiConflictResponse } from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { OrgDto } from './dto/org.dto';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';
import { OrgsService } from './orgs.service';
import { IsDefined, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';

export class CreateOrgDto {
    @IsDefined()
    @IsString()
    @IsNotEmpty()
    @MaxLength(120)
    name!: string;
}

@ApiTags('Orgs')
@Controller('orgs')
export class OrgsController {
    constructor(private readonly orgs: OrgsService) { }

    @Get()
    @UseInterceptors(CachingInterceptor)
    @ApiOkResponse({ description: 'List organizations', type: OrgDto, isArray: true })
    @ApiBadRequestResponse({ description: 'Bad request', schema: { example: { error: { code: 'bad-request', message: 'Invalid filter' } } } })
    @ApiStandardErrors()
    async list(): Promise<OrgDto[]> {
        return this.orgs.list();
    }

    @Get(':id')
    @ApiOkResponse({ description: 'Get an organization', type: OrgDto })
    @ApiNotFoundResponse({ description: 'Org not found', schema: { example: { error: { code: 'not-found', message: 'Org not found' } } } })
    @ApiStandardErrors({ notFound: true })
    async getOne(@Param('id') id: string): Promise<OrgDto> {
        const org = await this.orgs.get(id);
        if (!org) throw new NotFoundException('Org not found');
        return org;
    }

    @Post()
    @HttpCode(201)
    @ApiCreatedResponse({ description: 'Organization created (users may have at most 10 orgs)', type: OrgDto })
    @ApiConflictResponse({ description: 'Organization limit reached or duplicate name', schema: { oneOf: [{ example: { error: { code: 'conflict', message: 'Organization limit reached (10)' } } }, { example: { error: { code: 'conflict', message: 'Organization name already exists', details: { name: ['already exists'] } } } }] } })
    @ApiBadRequestResponse({ description: 'Invalid body', schema: { example: { error: { code: 'validation-failed', message: 'Validation failed', details: { name: ['must be a string'] } } } } })
    @ApiStandardErrors()
    async create(@Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateOrgDto): Promise<OrgDto> {
        return this.orgs.create(dto.name.trim());
    }
}
