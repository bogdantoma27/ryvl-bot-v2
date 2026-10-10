import {
  BadGatewayException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { EaService } from './ea.service';

// EA rejects requests from some hosts, including Render where the FC Draft RO site
// runs. This server reaches EA fine, so it forwards that site's read-only EA calls:
// GET /api/ea-relay/fc/<path>?<params> returns EA's own JSON for the same request.
export const EA_RELAY_PATHS = new Set([
  'clubs/matches',
  'clubs/info',
  'clubs/overallStats',
  'members/stats',
  'members/career/stats',
  'club/playoffAchievements',
  'allTimeLeaderboard/search',
]);
const EA_RELAY_PARAMS = new Set(['platform', 'clubIds', 'clubId', 'matchType', 'maxResultCount', 'clubName']);
const EA_RELAY_MAX_PER_MINUTE = 60;

@Controller('api/ea-relay/fc')
export class EaRelayController {
  private readonly logger = new Logger(EaRelayController.name);
  private windowStart = 0;
  private windowCount = 0;

  constructor(private readonly eaService: EaService) {}

  @Get(':section/:name')
  relayTwo(@Param('section') section: string, @Param('name') name: string, @Query() query: Record<string, unknown>) {
    return this.relay(`${section}/${name}`, query);
  }

  @Get(':section/:group/:name')
  relayThree(
    @Param('section') section: string,
    @Param('group') group: string,
    @Param('name') name: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.relay(`${section}/${group}/${name}`, query);
  }

  async relay(path: string, query: Record<string, unknown>): Promise<unknown> {
    if (!EA_RELAY_PATHS.has(path)) throw new NotFoundException();
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query ?? {})) {
      if (EA_RELAY_PARAMS.has(key) && typeof value === 'string' && value.length <= 200) params[key] = value;
    }
    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    if (++this.windowCount > EA_RELAY_MAX_PER_MINUTE) {
      throw new HttpException('Too many EA relay requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      const data = await this.eaService.relay(`/${path}`, params);
      if (data && typeof data === 'object' && !Array.isArray(data) && 'error' in data) {
        throw new Error(String((data as { error: unknown }).error));
      }
      return data;
    } catch (error: any) {
      this.logger.warn(`EA relay ${path} failed: ${error?.message ?? error}`);
      throw new BadGatewayException('EA request failed');
    }
  }
}
