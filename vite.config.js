import { defineConfig, createLogger } from 'vite';

// The dev server listens on localhost only; it is opened from a phone through Tailscale
// (`tailscale serve`), under this machine's ts.net name. The port is fixed at 5188 so it does not
// collide with other vite projects on the default 5173.
const PORT = 5188;
const viaTailscale = { port: PORT, strictPort: true, allowedHosts: ['.ts.net'] };

// Pixel saves art often, and each save reloads the page. Print the URL again after every reload
// message, so a clickable link is always at the bottom of the terminal instead of scrolled away.
const logger = createLogger();
const info = logger.info.bind(logger);
logger.info = (msg, opts) => {
  info(msg, opts);
  if (/page reload|hmr update/.test(msg)) info(`  ➜  http://127.0.0.1:${PORT}/`, { timestamp: false });
};

export default defineConfig({ base: './', server: viaTailscale, preview: viaTailscale, customLogger: logger, clearScreen: false });
