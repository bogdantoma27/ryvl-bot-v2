import { Global, Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { EventCreateCommand } from './commands/event-create.command';
import { EventListCommand } from './commands/event-list.command';
import { EventDeleteCommand } from './commands/event-delete.command';
import { EventEditCommand } from './commands/event-edit.command';
import { RsvpButtonHandler } from './interactions/rsvp-button.handler';
import { LineupPostCommand } from './commands/lineup-post.command';
import { LineupRendererService } from '../lineup/lineup-renderer.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [PrismaModule, EventsModule],
  providers: [
    DiscordService,
    EventCreateCommand,
    EventListCommand,
    EventDeleteCommand,
    EventEditCommand,
    RsvpButtonHandler,
    LineupRendererService,
    LineupPostCommand,
  ],
  exports: [DiscordService],
})
export class DiscordModule {}
