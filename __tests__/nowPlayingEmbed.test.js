import { jest } from '@jest/globals';

jest.unstable_mockModule('discord.js', () => ({
  EmbedBuilder: class {
    constructor() { this.data = {}; }
    setTitle(t) { this.data.title = t; return this; }
    setColor(c) { this.data.color = c; return this; }
    setFooter(f) { this.data.footer = f; return this; }
    setDescription(d) { this.data.description = d; return this; }
    addFields(f) { this.data.fields = f; return this; }
    setThumbnail(t) { this.data.thumbnail = t; return this; }
    toJSON() { return this.data; }
  }
}));

jest.unstable_mockModule('fs/promises', () => ({
  default: { readFile: jest.fn(() => Promise.resolve('{}')) },
  readFile: jest.fn(() => Promise.resolve('{}'))
}));

const mod = await import('../utils/nowPlayingEmbed.js');
const { generateNowPlayingEmbed, generateStoppedEmbed } = mod;
global.config = { prefix: '.' };

describe('nowPlayingEmbed', () => {
  test('generateStoppedEmbed returns embed', () => {
    const embed = generateStoppedEmbed();
    expect(embed.toJSON()).toHaveProperty('title');
  });

  test('generateNowPlayingEmbed builds progress', () => {
    const player = {
      queue: { current: { info: { title: 'Song', author: 'Artist', duration: 6000 } }, tracks: [] },
      position: 3000,
      paused: false
    };
    const embed = generateNowPlayingEmbed(player);
    expect(embed.toJSON()).toHaveProperty('description');
  });
});
