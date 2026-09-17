import * as THREE from 'three';

const COLORS = {
    sand:    0xC2B280,
    wall:    0x8B7355,
    wallDark:0x6B5335,
    crate:   0xA0522D,
    plantA:  0xCC3333,
    plantB:  0x3366CC,
    plantC:  0x33CC66,
    towerT:  0x8B0000,
    towerCT: 0x1E3A8A
};

function box(w, h, d, color, x, y, z, parent, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (opts.userData) mesh.userData = opts.userData;
    parent.add(mesh);
    return mesh;
}

export function createArena() {
    const arena = new THREE.Group();
    const H = 4;

    const floorGeo = new THREE.PlaneGeometry(120, 120);
    const floorMat = new THREE.MeshLambertMaterial({ color: COLORS.sand });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    arena.add(floor);

    box(100, H, 2, COLORS.wall, 0, H/2, -50, arena);
    box(100, H, 2, COLORS.wall, 0, H/2,  50, arena);
    box(2, H, 100, COLORS.wall, -50, H/2, 0, arena);
    box(2, H, 100, COLORS.wall,  50, H/2, 0, arena);

    box(2, H, 25, COLORS.wallDark, -5, H/2, 0, arena);
    box(2, H, 25, COLORS.wallDark,  5, H/2, 0, arena);

    box(2, H, 30, COLORS.wallDark, -30, H/2, -10, arena);
    box(20, H, 2, COLORS.wallDark, -20, H/2, -25, arena);

    box(2, H, 30, COLORS.wallDark, 30, H/2, 10, arena);
    box(20, H, 2, COLORS.wallDark, 20, H/2, 25, arena);

    box(2, H, 20, COLORS.wallDark, 15, H/2, -15, arena);

    const cratePositions = [
        [-10, -10], [-8, -10], [-10, -8],
        [10, 10], [12, 10], [10, 12],
        [0, 20], [-15, 5], [15, -5]
    ];
    cratePositions.forEach(([x, z]) => {
        box(2, 2, 2, COLORS.crate, x, 1, z, arena);
    });

    box(5, 0.3, 5, COLORS.plantA, -35, 0.15, -35, arena, {
        userData: { type: 'plant', id: 'A' }
    });
    box(5, 0.3, 5, COLORS.plantB, 35, 0.15, 35, arena, {
        userData: { type: 'plant', id: 'B' }
    });
    box(5, 0.3, 5, COLORS.plantC, 0, 0.15, -40, arena, {
        userData: { type: 'plant', id: 'C' }
    });

    box(4, 8, 4, COLORS.towerT, 0, 4, 45, arena, {
        userData: { type: 'tower', team: 'T', hp: 1000, maxHp: 1000 }
    });
    box(4, 8, 4, COLORS.towerCT, 0, 4, -45, arena, {
        userData: { type: 'tower', team: 'CT', hp: 1000, maxHp: 1000 }
    });

    return arena;
}
