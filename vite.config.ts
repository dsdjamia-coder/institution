import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolve = path.resolve;

const cleanUrlsPlugin = (): Plugin => {
  const handler = (req: any, res: any, next: () => void) => {
    if (req.url) {
      const [pathname, search] = req.url.split('?');
      const query = search ? `?${search}` : '';
      if (pathname === '/studentmanagement' || pathname === '/student-fee-system') {
        res.writeHead(302, { Location: `/student.html${query}` });
        res.end();
        return;
      }
      if (pathname === '/official-dashboard') {
        res.writeHead(302, { Location: `/official.html${query}` });
        res.end();
        return;
      }
      const knownPages = [
        'admin',
        'attendance',
        'academic-plan',
        'activity',
        'evaluation',
        'collection',
        'official',
        'result',
        'student',
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
    host: 'localhost',
    port: 3000,
  },
  preview: {
    host: 'localhost',
    port: 3000,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        collection: resolve(__dirname, 'collection.html'),
        official: resolve(__dirname, 'official.html'),
        result: resolve(__dirname, 'result.html'),
        student: resolve(__dirname, 'student.html'),
        worksheet: resolve(__dirname, 'worksheet.html'),
        attendance: resolve(__dirname, 'attendance.html'),
        academicPlan: resolve(__dirname, 'academic-plan.html'),
        activity: resolve(__dirname, 'activity.html'),
        evaluation: resolve(__dirname, 'evaluation.html'),
      }
    }
  }
});
