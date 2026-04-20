import { v4 as uuidv4 } from 'uuid';

/**
 * Genera un room_id único basado en UUID v4.
 */
export function generateRoomId(): string {
  return uuidv4();
}

/**
 * Construye la URL pública de la sala de telemedicina.
 */
export function buildRoomUrl(roomId: string): string {
  return `https://telemed.petwell.com/room/${roomId}`;
}
