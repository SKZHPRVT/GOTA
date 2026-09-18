import * as THREE from 'three';
import { loadMap } from './loader.js';

// Загружает dust2.json и возвращает arena + colliders
export async function createArena() {
    const arena = new THREE.Group();
    const result = await loadMap('/assets/maps/dust2.json', arena);
    return { arena, ...result };
}
