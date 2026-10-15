import { env } from './env';

export async function register() {
  // Environment variables are validated on import of './env'
  // If we reach here, they are valid.
  console.log(`✅ Environment validated (App Env: ${env.APP_ENV})`);
}
