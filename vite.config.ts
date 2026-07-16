import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const webdavDevMiddleware = (): Plugin => ({
  name: 'webdav-dev-middleware',
  configureServer(server) {
    server.middlewares.use('/api/webdav', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const { operation, config, payload } = JSON.parse(body);

          if (!config || !config.url || !config.username || !config.password) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing configuration' }));
            return;
          }

          let baseUrl = config.url.trim();
          if (!baseUrl.endsWith('/')) baseUrl += '/';

          const filename = 'cloudnav_backup.json';
          const fileUrl = baseUrl + filename;

          const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;

          let fetchUrl = baseUrl;
          let method = 'PROPFIND';
          const headers: Record<string, string> = {
            'Authorization': authHeader,
            'User-Agent': 'CloudNav/1.0'
          };
          let requestBody: string | undefined = undefined;

          if (operation === 'check') {
            fetchUrl = baseUrl;
            method = 'PROPFIND';
            headers['Depth'] = '0';
          } else if (operation === 'upload') {
            fetchUrl = fileUrl;
            method = 'PUT';
            headers['Content-Type'] = 'application/json';
            requestBody = JSON.stringify(payload);
          } else if (operation === 'download') {
            fetchUrl = fileUrl;
            method = 'GET';
          } else {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Invalid operation' }));
            return;
          }

          const response = await fetch(fetchUrl, {
            method,
            headers,
            body: requestBody as any
          });

          if (operation === 'download') {
            if (!response.ok) {
              res.statusCode = response.status;
              res.setHeader('Content-Type', 'application/json');
              if (response.status === 404) {
                res.end(JSON.stringify({ error: 'Backup file not found' }));
              } else {
                res.end(JSON.stringify({ error: `WebDAV Error: ${response.status}` }));
              }
              return;
            }
            const data = await response.json();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return;
          }

          const success = response.ok || response.status === 207;
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success, status: response.status }));

        } catch (err: any) {
          console.error('WebDAV Dev Middleware Error:', err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'Unknown error' }));
        }
      });
    });
  }
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), webdavDevMiddleware()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
