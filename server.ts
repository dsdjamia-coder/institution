import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Clean redirects for legacy routes
app.get(['/studentmanagement', '/student-fee-system'], (req, res) => {
  res.redirect(301, '/student');
});

app.get('/official-dashboard', (req, res) => {
  res.redirect(301, '/official');
});

// Serve static files from root with clean URLs support
app.use(express.static(__dirname, { extensions: ['html', 'htm'] }));

// Fallback for home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start listening safely on localhost
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server is running securely on http://127.0.0.1:${PORT}`);
});
