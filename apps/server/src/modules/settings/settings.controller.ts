import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  NotFoundException,
  UseInterceptors,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ApiTags,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBody,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { CachingInterceptor } from '../../common/interceptors/caching.interceptor';
import { Setting } from '../../entities/setting.entity';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>
  ) {}

  @Get()
  @UseInterceptors(CachingInterceptor)
  @ApiOkResponse({
    description: 'List all settings',
    schema: { example: [{ key: 'theme', value: 'dark' }] },
  })
  @ApiStandardErrors()
  async list() {
    const settings = await this.settingRepository.find({
      order: { key: 'ASC' },
    });
    return settings.map((s) => ({ key: s.key, value: s.value }));
  }

  @Get(':key')
  @ApiOkResponse({
    description: 'Get a single setting',
    schema: { example: { key: 'theme', value: 'dark' } },
  })
  @ApiNotFoundResponse({
    description: 'Setting not found',
    schema: {
      example: { error: { code: 'not-found', message: 'Setting not found' } },
    },
  })
  @ApiStandardErrors({ notFound: true })
  async getOne(@Param('key') key: string) {
    const setting = await this.settingRepository.findOne({ where: { key } });
    if (!setting) {
      throw new NotFoundException('Setting not found');
    }
    return { key: setting.key, value: setting.value };
  }

  @Put(':key')
  @ApiBody({ schema: { example: { value: 'dark' } } })
  @ApiOkResponse({
    description: 'Update or create a setting',
    schema: { example: { key: 'theme', value: 'dark' } },
  })
  @ApiStandardErrors()
  async update(@Param('key') key: string, @Body() body: { value: any }) {
    // Upsert using save (TypeORM handles conflict automatically with primary key)
    const setting = this.settingRepository.create({
      key,
      value: body.value,
    });
    await this.settingRepository.save(setting);
    return { key, value: body.value };
  }
}
