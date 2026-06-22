import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'express-api-routes',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url && req.url.startsWith('/api')) {
              try {
                // Dynamically import dependencies inside configureServer
                const { apiRouter } = await import('./src/api-router');
                const express = (await import('express')).default;
                const apiApp = express();
                
                apiApp.use(express.json({
                  verify: (req: any, _res: any, buf: any) => {
                    req.rawBody = buf;
                  }
                }));
                apiApp.use(express.urlencoded({ extended: true }));
                apiApp.use('/api', apiRouter);
                
                apiApp(req as any, res as any, next);
              } catch (err) {
                console.error("[Vite API Proxy] Error during API delegation:", err);
                next(err);
              }
            } else {
              next();
            }
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: false,
      watch: null,
    },
  };
});
