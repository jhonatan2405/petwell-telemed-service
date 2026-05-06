import { createDailyRoom, createMeetingToken } from '../../src/utils/daily.util';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Daily Util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDailyRoom', () => {
    it('debe crear una sala con éxito', async () => {
      mockedAxios.post.mockResolvedValue({ data: { name: 'room-1', url: 'http://room' } });
      const result = await createDailyRoom();
      expect(result).toHaveProperty('name', 'room-1');
    });

    it('debe lanzar error si falla', async () => {
      mockedAxios.post.mockRejectedValue(new Error('daily timeout'));
      await expect(createDailyRoom()).rejects.toThrow('Daily.co: no se pudo crear la sala — daily timeout');
    });
  });

  describe('createMeetingToken', () => {
    it('debe crear un token con éxito', async () => {
      mockedAxios.post.mockResolvedValue({ data: { token: 'token-abc' } });
      const result = await createMeetingToken('room-1', 'user-1', true);
      expect(result).toBe('token-abc');
    });

    it('debe lanzar error si falla', async () => {
      mockedAxios.post.mockRejectedValue(new Error('token error'));
      await expect(createMeetingToken('room-1', 'user-1', true)).rejects.toThrow('Daily.co: no se pudo generar el token — token error');
    });
  });
});
