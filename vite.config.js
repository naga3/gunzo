import { defineConfig } from 'vite';

// The dev server listens on localhost only; it is opened from a phone through Tailscale
// (`tailscale serve`), under this machine's ts.net name. The port is fixed at 5188 so it does not
// collide with other vite projects on the default 5173.
const viaTailscale = { port: 5188, strictPort: true, allowedHosts: ['.ts.net'] };

export default defineConfig({ base: './', server: viaTailscale, preview: viaTailscale });
