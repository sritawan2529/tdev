import 'dotenv/config';

export function loadConfig(environment = process.env) {
  const config = {
    port: Number(environment.PORT || 3000),
    databaseUrl: environment.DATABASE_URL,
    jwtSecret: environment.JWT_SECRET,
    allowedOrigins: String(environment.ALLOWED_ORIGINS || 'https://sritawan2529.github.io')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  };

  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  if (!Number.isInteger(config.port) || config.port < 1) throw new Error('PORT must be a valid number');
  return config;
}
