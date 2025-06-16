import { formatTrackTitle } from '../utils/formatTrack.js';

describe('formatTrackTitle', () => {
  test('returns title as-is when requested as URL', () => {
    const info = { title: 'Song A', author: 'Artist' };
    expect(formatTrackTitle(info, true)).toBe('Song A');
  });

  test('prepends author when not already included', () => {
    const info = { title: 'Song B', author: 'Artist' };
    expect(formatTrackTitle(info, false)).toBe('Artist - Song B');
  });

  test('does not prepend author if already present', () => {
    const info = { title: 'Artist - Song B', author: 'Artist' };
    expect(formatTrackTitle(info, false)).toBe('Artist - Song B');
  });
});
