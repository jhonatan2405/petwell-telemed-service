import axios from 'axios';
import { env } from '../config/env';

const DAILY_API_BASE = 'https://api.daily.co/v1';

// ─── Tipos Daily.co ───────────────────────────────────────────────────────────

export interface DailyRoom {
  id: string;
  name: string;
  url: string;
  privacy: string;
  created_at: string;
}

export interface DailyToken {
  token: string;
}

export interface DailyRoomOptions {
  /** Tiempo de expiración de la sala (epoch seconds). Por defecto: 24h desde creación */
  exp?: number;
  /** Si true, la sala requiere token para entrar */
  enable_prejoin_ui?: boolean;
}

export interface DailyTokenOptions {
  room_name: string;
  /** ID del usuario en nuestro sistema */
  user_id: string;
  /** Si true, el participante es propietario (comparte pantalla, graba, etc.) */
  is_owner: boolean;
  /** Expiración del token (epoch seconds) */
  exp?: number;
  /** Tiempo a partir del cual el token es válido (epoch seconds) */
  nbf?: number;
}

// ─── Headers comunes ──────────────────────────────────────────────────────────

function dailyHeaders() {
  return {
    Authorization: `Bearer ${env.DAILY_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ─── createDailyRoom ─────────────────────────────────────────────────────────
/**
 * Crea una sala privada en Daily.co.
 * La sala expira 24 horas después de ser creada (configurable).
 * Lanza error 502 si Daily no responde.
 */
export async function createDailyRoom(options?: DailyRoomOptions): Promise<DailyRoom> {
  const exp = options?.exp ?? Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24h

  try {
    const { data } = await axios.post<DailyRoom>(
      `${DAILY_API_BASE}/rooms`,
      {
        privacy: 'private',           // requiere token para entrar
        properties: {
          exp,
          enable_prejoin_ui: options?.enable_prejoin_ui ?? false,
          enable_chat: true,
          enable_screenshare: true,
        },
      },
      { headers: dailyHeaders() }
    );
    return data;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const error = new Error(`Daily.co: no se pudo crear la sala — ${msg}`) as NodeJS.ErrnoException;
    error.code = '502';
    throw error;
  }
}

// ─── createMeetingToken ───────────────────────────────────────────────────────
/**
 * Genera un token firmado por Daily.co para que un participante entre a la sala.
 *
 * @param roomName  Nombre de la sala (room.name devuelto por createDailyRoom)
 * @param userId    UUID del usuario en nuestro sistema (owner_id o veterinarian_id)
 * @param isOwner   true → veterinario (puede expulsar, grabar, compartir pantalla)
 *                  false → dueño de mascota (participante estándar)
 *
 * Lanza error 502 si Daily no responde.
 */
export async function createMeetingToken(
  roomName: string,
  userId: string,
  isOwner: boolean
): Promise<string> {
  // Token válido durante 6 horas desde ahora
  const exp = Math.floor(Date.now() / 1000) + 6 * 60 * 60;

  try {
    const { data } = await axios.post<DailyToken>(
      `${DAILY_API_BASE}/meeting-tokens`,
      {
        properties: {
          room_name: roomName,
          user_id: userId,
          is_owner: isOwner,
          exp,
          enable_screenshare: isOwner, // solo el veterinario puede compartir pantalla
        },
      },
      { headers: dailyHeaders() }
    );
    return data.token;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const error = new Error(`Daily.co: no se pudo generar el token — ${msg}`) as NodeJS.ErrnoException;
    error.code = '502';
    throw error;
  }
}
