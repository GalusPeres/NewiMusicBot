import { jest } from '@jest/globals';
import { safeEdit, safeDelete } from '../utils/safeDiscord.js';

describe('safeDiscord', () => {
  test('safeEdit ignores unknown message error', async () => {
    const msg = { edit: jest.fn(() => Promise.reject({ code: 10008 })) };
    await expect(safeEdit(msg, {})).resolves.toBeUndefined();
  });

  test('safeEdit retries on rate limit', async () => {
    const edit = jest
      .fn()
      .mockRejectedValueOnce({ status: 429, retry_after: 0.001 })
      .mockResolvedValue('ok');
    const msg = { edit };
    const res = await safeEdit(msg, {});
    expect(res).toBe('ok');
  });

  test('safeDelete ignores unknown message error', async () => {
    const msg = { delete: jest.fn(() => Promise.reject({ code: 10008 })) };
    await expect(safeDelete(msg)).resolves.toBeUndefined();
  });
});
