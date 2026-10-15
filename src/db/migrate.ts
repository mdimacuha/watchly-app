import 'dotenv/config'; // Load .env file before anything else
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '@/env';

async function main() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool);

  await migrate(db, { migrationsFolder: 'src/db/migrations' });

  await pool.end();
  console.log('Migrations applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
