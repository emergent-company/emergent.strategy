import {
  Controller,
  Get,
  Param,
  NotFoundException,
  UseInterceptors,
  Post,
  Body,
  HttpCode,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiTags,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiCreatedResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { OrgDto } from './dto/org.dto';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';
import { OrgsService } from './orgs.service';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
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
  constructor(private readonly orgs: OrgsService) {}

  @Get()
  @UseGuards(AuthGuard)
  @UseInterceptors(CachingInterceptor)
  @ApiOkResponse({
    description: 'List organizations',
    type: OrgDto,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: 'Bad request',
    schema: {
      example: { error: { code: 'bad-request', message: 'Invalid filter' } },
    },
  })
  @ApiStandardErrors()
  async list(@Req() req: any): Promise<OrgDto[]> {
    const userId: string | undefined = req?.user?.id; // Use internal UUID, not external sub
    console.log('[OrgsController.list] Called with userId:', userId);
    console.log(
      '[OrgsController.list] req.user:',
      JSON.stringify(req?.user, null, 2)
    );

    const orgs = await this.orgs.list(userId);
    console.log(
      '[OrgsController.list] Found',
      orgs.length,
      'orgs:',
      orgs.map((o) => ({ id: o.id, name: o.name }))
    );

    return orgs;
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Get an organization', type: OrgDto })
  @ApiNotFoundResponse({
    description: 'Org not found',
    schema: {
      example: { error: { code: 'not-found', message: 'Org not found' } },
    },
  })
  @ApiStandardErrors({ notFound: true })
  async getOne(@Param('id') id: string): Promise<OrgDto> {
    const org = await this.orgs.get(id);
    if (!org) throw new NotFoundException('Org not found');
    return org;
  }

  @Post()
  // Apply AuthGuard + ScopesGuard: ensures req.user is populated AND user profile exists in DB
  @UseGuards(AuthGuard, ScopesGuard)
  @HttpCode(201)
  @ApiCreatedResponse({
    description: 'Organization created (users may have at most 10 orgs)',
    type: OrgDto,
  })
  @ApiConflictResponse({
    description: 'Organization limit reached or duplicate name',
    schema: {
      oneOf: [
        {
          example: {
            error: {
              code: 'conflict',
              message: 'Organization limit reached (10)',
            },
          },
        },
        {
          example: {
            error: {
              code: 'conflict',
              message: 'Organization name already exists',
              details: { name: ['already exists'] },
            },
          },
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid body',
    schema: {
      example: {
        error: {
          code: 'validation-failed',
          message: 'Validation failed',
          details: { name: ['must be a string'] },
        },
      },
    },
  })
  @ApiStandardErrors()
  async create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateOrgDto,
    @Req() req: any
  ): Promise<OrgDto> {
    const userId: string | undefined = req?.user?.id; // Use internal UUID, not external sub
    return this.orgs.create(dto.name.trim(), userId);
  }

  @Delete(':id')
  @ApiOkResponse({
    description:
      'Organization deleted (projects, documents, chunks, conversations cascade)',
  })
  @ApiNotFoundResponse({
    description: 'Org not found',
    schema: {
      example: { error: { code: 'not-found', message: 'Org not found' } },
    },
  })
  @ApiStandardErrors({ notFound: true })
  async delete(@Param('id') id: string) {
    const ok = await this.orgs.delete(id);
    if (!ok)
      throw new NotFoundException({
        error: { code: 'not-found', message: 'Org not found' },
      });
    return { status: 'deleted' };
  }
}
