import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

const cleanUrlsPlugin = (): Plugin => {
  const handler = (req: any, res: any, next: () => void) => {
    if (req.url) {
      const [pathname, search] = req.url.split('?');
      const query = search ? `?${search}` : '';
      if (pathname === '/studentmanagement') {
        res.writeHead(302, { Location: `/student.html${query}` });
        res.end();
        return;
      }
      const knownPages = [
        'admin',
        'collection',
        'official',
        'official-dashboard',
        'result',
        'student',
        'student-fee-system',
        'worksheet'
      ];
      const trimmed = pathname.replace(/^\/+|\/+$/g, '');
      if (knownPages.includes(trimmed)) {
        req.url = `/${trimmed}.html${query}`;
      }
    }
    next();
  };

  return {
    name: 'clean-urls',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    }
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cleanUrlsPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        collection: resolve(__dirname, 'collection.html'),
        official: resolve(__dirname, 'official.html'),
        officialDashboard: resolve(__dirname, 'official-dashboard.html'),
        result: resolve(__dirname, 'result.html'),
        student: resolve(__dirname, 'student.html'),
        studentFeeSystem: resolve(__dirname, 'student-fee-system.html'),
        worksheet: resolve(__dirname, 'worksheet.html'),
      }
    }
  }
});
