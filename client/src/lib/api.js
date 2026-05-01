// In dev, VITE_API_URL is empty and requests go to '/api/...' which Vite's
// proxy forwards to localhost:3001. In production (Vercel), set VITE_API_URL
// to your Render backend URL (e.g. https://propertyiq-backend.onrender.com).
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
