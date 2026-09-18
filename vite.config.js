import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
    root: 'client',
    // В dev — без base, в build — с base для GitHub Pages
    base: command === 'build' ? '/GOTA/' : '/',
    server: {
        host: '0.0.0.0',
        port: 5173
    },
    build: {
        outDir: '../dist',
        emptyOutDir: true
    }
}));
