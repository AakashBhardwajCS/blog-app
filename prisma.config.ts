import path from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';

loadEnvFile(path.resolve('backend/.env'));

export default defineConfig({
  schema: path.join('backend', 'prisma', 'schema.prisma'),
});
