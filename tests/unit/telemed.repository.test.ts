import { insertSession, findSessionById, findSessionByAppointmentId, updateSessionStatus } from '../../src/repositories/telemed.repository';
import { supabase } from '../../src/config/supabase';

jest.mock('../../src/config/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    single: jest.fn(),
  }
}));

describe('Telemed Repository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('insertSession', () => {
    it('debe insertar y devolver la sesión', async () => {
      (supabase as any).single.mockResolvedValue({ data: { id: 'sess-1' }, error: null });
      const result = await insertSession({ appointment_id: 'app-1' } as any);
      expect(result).toEqual({ id: 'sess-1' });
    });

    it('debe lanzar error si falla', async () => {
      (supabase as any).single.mockResolvedValue({ data: null, error: { message: 'db error' } });
      await expect(insertSession({} as any)).rejects.toThrow('db error');
    });
  });

  describe('findSessionById', () => {
    it('debe encontrar la sesión', async () => {
      (supabase as any).single.mockResolvedValue({ data: { id: 'sess-1' }, error: null });
      const result = await findSessionById('sess-1');
      expect(result).toEqual({ id: 'sess-1' });
    });

    it('debe devolver null si no se encuentra (PGRST116)', async () => {
      (supabase as any).single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      const result = await findSessionById('sess-1');
      expect(result).toBeNull();
    });

    it('debe lanzar error si hay otro fallo', async () => {
      (supabase as any).single.mockResolvedValue({ data: null, error: { message: 'db error' } });
      await expect(findSessionById('sess-1')).rejects.toThrow('db error');
    });
  });

  describe('findSessionByAppointmentId', () => {
    it('debe encontrar la sesión por cita', async () => {
      (supabase as any).single.mockResolvedValue({ data: { id: 'sess-1' }, error: null });
      const result = await findSessionByAppointmentId('app-1');
      expect(result).toEqual({ id: 'sess-1' });
    });

    it('debe devolver null si no se encuentra', async () => {
      (supabase as any).single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
      const result = await findSessionByAppointmentId('app-1');
      expect(result).toBeNull();
    });
  });

  describe('updateSessionStatus', () => {
    it('debe actualizar la sesión', async () => {
      (supabase as any).single.mockResolvedValue({ data: { id: 'sess-1', status: 'READY' }, error: null });
      const result = await updateSessionStatus('sess-1', { status: 'READY' });
      expect(result).toEqual({ id: 'sess-1', status: 'READY' });
    });

    it('debe lanzar error si falla', async () => {
      (supabase as any).single.mockResolvedValue({ data: null, error: { message: 'db error' } });
      await expect(updateSessionStatus('sess-1', { status: 'READY' })).rejects.toThrow('db error');
    });
  });
});
