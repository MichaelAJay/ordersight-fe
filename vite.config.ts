import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  // Loads .env, .env.local, .env.<mode>, .env.<mode>.local
  // with NO prefix filter, so you can read VITE_ALLOWED_HOST here.
  const env = loadEnv(mode, process.cwd(), '');

  // IMPORTANT: allowedHosts should be just the host, no protocol.
  // Example: "abcd-1234.ngrok-free.dev"
  const allowedHost = (env?.['VITE_ALLOWED_HOST'] || '').replace(/^https?:\/\//, '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    // ✅ Vite dev server config
    server: {
      host: true,
      port: 5173,
      allowedHosts: ['localhost', allowedHost].filter(Boolean),
    },

    // ✅ Vitest config can stay here (that part is fine)
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      css: true,
    },
  };
});
