import { createSession, getSessionById, getActiveSession, endSession, getSessionByAppointment, generateAccessToken, cancelSession } from '../../src/services/telemed.service';
import * as telemedRepo from '../../src/repositories/telemed.repository';
import * as dailyUtil from '../../src/utils/daily.util';
import axios from 'axios';
import { JwtPayload } from '../../src/utils/jwt.util';

// Mock dependencias
jest.mock('../../src/repositories/telemed.repository');
jest.mock('../../src/utils/daily.util');
jest.mock('axios');

const mockRepo = telemedRepo as jest.Mocked<typeof telemedRepo>;
const mockDaily = dailyUtil as jest.Mocked<typeof dailyUtil>;
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Telemed Service Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockUser: JwtPayload = { sub: 'user-123', email: 'vet@test.com', role: 'VETERINARIO' };

  describe('createSession', () => {
    it('debe lanzar error 502 si falla Appointment Service', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));
      const body = {
        appointment_id: 'app-1',
        clinic_id: 'clinic-1',
        veterinarian_id: 'vet-1',
        owner_id: 'owner-1',
        pet_id: 'pet-1',
        scheduled_at: new Date().toISOString()
      };

      await expect(createSession(body, 'token123')).rejects.toThrow('Appointment Service no disponible');
    });

    it('debe lanzar error 400 si la cita no es TELEMEDICINA', async () => {
      mockedAxios.get.mockResolvedValue({ data: { data: { type: 'PRESENCIAL' } } });
      const body = { appointment_id: 'app-1', clinic_id: 'c-1', veterinarian_id: 'v-1', owner_id: 'o-1', pet_id: 'p-1', scheduled_at: new Date().toISOString() };
      await expect(createSession(body, 'token')).rejects.toThrow('La cita no es de tipo TELEMEDICINA');
    });

    it('debe lanzar error 502 si no hay datos en Appointment Service', async () => {
      mockedAxios.get.mockResolvedValue({ data: null });
      const body = { appointment_id: 'app-1', clinic_id: 'c-1', veterinarian_id: 'v-1', owner_id: 'o-1', pet_id: 'p-1', scheduled_at: new Date().toISOString() };
      await expect(createSession(body, 'token')).rejects.toThrow('No se pudo obtener la cita del Appointment Service');
    });

    it('debe crear una sesión exitosamente si la cita es TELEMEDICINA', async () => {
      mockedAxios.get.mockResolvedValue({ data: { data: { type: 'TELEMEDICINA' } } });
      mockRepo.findSessionByAppointmentId.mockResolvedValue(null);
      mockDaily.createDailyRoom.mockResolvedValue({ name: 'room-1', url: 'https://room.url', id: '1', privacy: 'private', created_at: '' });
      mockRepo.insertSession.mockResolvedValue({ id: 'sess-1', room_id: 'room-1' } as any);

      const result = await createSession({
        appointment_id: 'app-1',
        clinic_id: 'clinic-1',
        veterinarian_id: 'vet-1',
        owner_id: 'owner-1',
        pet_id: 'pet-1',
        scheduled_at: new Date().toISOString()
      }, 'token');

      expect(result).toHaveProperty('id', 'sess-1');
      expect(result).toHaveProperty('room_id', 'room-1');
    });
  });

  describe('getSessionById', () => {
    it('debe lanzar error 404 si la sesión no existe', async () => {
      mockRepo.findSessionById.mockResolvedValue(null);
      await expect(getSessionById('sess-not-found', mockUser)).rejects.toThrow('Sesión de telemedicina no encontrada');
    });

    it('debe lanzar error 403 si personal de clinica ve sesión ajena', async () => {
      const clinicUser: JwtPayload = { sub: 'admin-1', email: 'a@test.com', role: 'CLINIC_ADMIN', clinic_id: 'clinic-1' };
      const mockSession: any = { id: 'sess-1', clinic_id: 'clinic-2' };
      mockRepo.findSessionById.mockResolvedValue(mockSession);
      
      await expect(getSessionById('sess-1', clinicUser)).rejects.toThrow('Sin permisos para ver sesiones de otra clínica');
    });

    it('debe devolver la sesión para un VETERINARIO sin restricciones', async () => {
      const mockSession: any = { id: 'sess-1' };
      mockRepo.findSessionById.mockResolvedValue(mockSession);
      const result = await getSessionById('sess-1', mockUser);
      expect(result).toEqual(mockSession);
    });

    it('debe lanzar error 403 si un DUENO_MASCOTA intenta ver sesión de otro', async () => {
      const duenoUser: JwtPayload = { sub: 'owner-1', email: 'o@test.com', role: 'DUENO_MASCOTA' };
      const mockSession: any = { id: 'sess-1', owner_id: 'owner-2' };
      mockRepo.findSessionById.mockResolvedValue(mockSession);
      
      await expect(getSessionById('sess-1', duenoUser)).rejects.toThrow('Sin permisos para ver esta sesión');
    });
  });

  describe('getActiveSession', () => {
    it('debe devolver null si no hay sesión activa', async () => {
      const result = await getActiveSession(mockUser);
      expect(result).toBeNull();
    });
  });

  describe('getSessionByAppointment', () => {
    it('debe devolver sesión por cita', async () => {
      mockRepo.findSessionByAppointmentId.mockResolvedValue({ id: 'sess-1', veterinarian_id: 'user-123' } as any);
      const result = await getSessionByAppointment('app-1', mockUser);
      expect(result).toHaveProperty('id', 'sess-1');
    });

    it('debe lanzar error 404 si no existe', async () => {
      mockRepo.findSessionByAppointmentId.mockResolvedValue(null);
      await expect(getSessionByAppointment('app-1', mockUser)).rejects.toThrow('No se encontró sesión para esta cita');
    });
  });

  describe('generateAccessToken', () => {
    it('debe lanzar error 403 si se pide con demasiada antelación', async () => {
      mockRepo.findSessionById.mockResolvedValue({ 
        id: 'sess-1', 
        veterinarian_id: 'user-123', 
        scheduled_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        status: 'IN_PROGRESS'
      } as any);

      await expect(generateAccessToken('sess-1', mockUser)).rejects.toThrow('La consulta aún no está disponible');
    });

    it('debe lanzar error si no está en progreso', async () => {
      mockRepo.findSessionById.mockResolvedValue({ 
        id: 'sess-1', 
        veterinarian_id: 'user-123', 
        scheduled_at: new Date(Date.now() - 60 * 1000).toISOString(),
        status: 'CREATED'
      } as any);

      await expect(generateAccessToken('sess-1', mockUser)).rejects.toThrow('La consulta no ha iniciado');
    });
  });

  describe('endSession', () => {
    it('debe lanzar error 403 si no es el veterinario asignado', async () => {
      mockRepo.findSessionById.mockResolvedValue({ 
        id: 'sess-1', 
        veterinarian_id: 'otro-user', 
        status: 'IN_PROGRESS'
      } as any);
      await expect(endSession('sess-1', mockUser)).rejects.toThrow('No eres el veterinario asignado a esta sesión');
    });

    it('debe lanzar error 409 si no esta IN_PROGRESS', async () => {
      mockRepo.findSessionById.mockResolvedValue({ 
        id: 'sess-1', 
        veterinarian_id: 'user-123', 
        status: 'CREATED'
      } as any);
      await expect(endSession('sess-1', mockUser)).rejects.toThrow('No se puede finalizar una sesión en estado CREATED');
    });

    it('debe finalizar la sesión', async () => {
      mockRepo.findSessionById.mockResolvedValue({ 
        id: 'sess-1', 
        veterinarian_id: 'user-123', 
        status: 'IN_PROGRESS',
        started_at: new Date().toISOString()
      } as any);
      mockRepo.updateSessionStatus.mockResolvedValue({ id: 'sess-1', status: 'COMPLETED' } as any);
      mockedAxios.patch.mockResolvedValue({});

      const result = await endSession('sess-1', mockUser);
      expect(result).toHaveProperty('status', 'COMPLETED');
    });
  });

  describe('cancelSession', () => {
    it('debe cancelar la sesión', async () => {
      mockRepo.findSessionById.mockResolvedValue({ 
        id: 'sess-1', 
        veterinarian_id: 'user-123', 
        status: 'CREATED'
      } as any);
      mockRepo.updateSessionStatus.mockResolvedValue({ id: 'sess-1', status: 'CANCELLED' } as any);

      const result = await cancelSession('sess-1', mockUser);
      expect(result).toHaveProperty('status', 'CANCELLED');
    });
  });
});
