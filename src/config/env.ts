import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  PORT: parseInt(process.env['PORT'] ?? '3006', 10),
  NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  JWT_SECRET: requireEnv('JWT_SECRET'),
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  ALLOWED_ORIGINS: process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:3000',
  APPOINTMENT_SERVICE_URL: process.env['APPOINTMENT_SERVICE_URL'] ?? 'http://localhost:3005',
  NOTIFICATION_SERVICE_URL: process.env['NOTIFICATION_SERVICE_URL'] ?? 'http://localhost:3007',
  DAILY_API_KEY: requireEnv('DAILY_API_KEY'),
  // Clave compartida para comunicación interna entre microservicios.
  // Debe ser idéntica en telemed-service y appointment-service.
  INTERNAL_SERVICE_KEY: requireEnv('INTERNAL_SERVICE_KEY'),
};
