import * as THREE from 'three';
import { loadMap } from './loader.js';

export async function createArena() {
    const arena = new THREE.Group();
    // Vite подставляет BASE_URL: '/' в dev, '/GOTA/' в prod
    const base = import.meta.env.BASE_URL || '/';
    const url = base + 'assets/maps/dust2.json';
    console.log('[arena] loading map from:', url);
    const result = await loadMap(url, arena);
    return { arena, ...result };
}
