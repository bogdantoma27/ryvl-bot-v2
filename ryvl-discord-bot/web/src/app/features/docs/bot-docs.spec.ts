import { toCommandDoc } from './bot-docs.component';

describe('toCommandDoc', () => {
  it('labels admin commands and shows required and optional options in the syntax', () => {
    const doc = toCommandDoc({
      name: '/totw post',
      command: 'totw',
      subcommand: 'post',
      description: 'Generate and post Team of the Week image to Discord',
      adminOnly: true,
      options: [
        { name: 'channel', description: 'Target text channel', type: 'channel', required: false },
        { name: 'league', description: 'League slug', type: 'text', required: true },
      ],
    });
    expect(doc.permission).toBe('Admin');
    expect(doc.category).toBe('vpg');
    expect(doc.syntax).toBe('/totw post [channel] <league>');
    expect(doc.parameters?.[0].description).toBe('Target text channel (channel)');
  });

  it('labels public commands for everyone and lists choices', () => {
    const doc = toCommandDoc({
      name: '/superliga leaderboard',
      command: 'superliga',
      subcommand: 'leaderboard',
      description: 'Display top player leaderboards for Superliga',
      adminOnly: false,
      options: [{ name: 'category', description: 'Category', type: 'text', required: true, choices: ['Top Strikers', 'Top Wingers'] }],
    });
    expect(doc.permission).toBe('Everyone');
    expect(doc.parameters?.[0].description).toBe('Category (Top Strikers, Top Wingers)');
  });

  it('files an unknown command under administration', () => {
    const doc = toCommandDoc({ name: '/new_cmd', command: 'new_cmd', subcommand: null, description: 'x', adminOnly: false, options: [] });
    expect(doc.category).toBe('admin');
  });
});
