import { jest } from '@jest/globals';

jest.unstable_mockModule('discord.js', () => {
  class MockButton {
    constructor() {
      this.setCustomId = jest.fn(() => this);
      this.setStyle = jest.fn(() => this);
      this.setDisabled = jest.fn(() => this);
      this.setEmoji = jest.fn(() => this);
      this.setLabel = jest.fn(() => this);
    }
  }
  class MockRow {
    constructor() { this.addComponents = jest.fn(() => this); }
  }
  return {
    ActionRowBuilder: MockRow,
    ButtonBuilder: MockButton,
    ButtonStyle: { Secondary: 1, Primary: 2, Success: 3, Danger: 4 }
  };
});

const { getEmoji, createButtonRowWithEmojis, getDisplayEmoji } = await import('../utils/emojiUtils.js');

describe('emojiUtils', () => {
  test('getEmoji returns custom emoji object', () => {
    const config = { emojiIds: { stop: '123' } };
    expect(getEmoji('stop', config)).toEqual({ name: 'stop', id: '123' });
  });

  test('getEmoji falls back to text', () => {
    expect(getEmoji('yt')).toBe('YT');
  });

  test('createButtonRowWithEmojis builds 5 buttons', () => {
    const player = { queue: { previous: [1], tracks: [1] } };
    const row = createButtonRowWithEmojis(player, {});
    expect(row.addComponents).toHaveBeenCalled();
    const buttons = row.addComponents.mock.calls[0][0];
    expect(buttons.length).toBe(5);
  });

  test('getDisplayEmoji formats custom emoji', () => {
    const config = { emojiIds: { ytm: '999' } };
    expect(getDisplayEmoji('ytm', config)).toBe('<:ytm:999>');
  });
});
