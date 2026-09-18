import * as THREE from 'three';

// ============ Toon-материал ============
const toonGradient = (() => {
    const colors = new Uint8Array([80, 160, 220, 255]);
    const tex = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
    tex.needsUpdate = true;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return tex;
})();

function toonMat(color) {
    return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient });
}

function addOutline(mesh, thickness = 0.05) {
    const outlineMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.BackSide
    });
    const outline = new THREE.Mesh(mesh.geometry, outlineMat);
    outline.scale.multiplyScalar(1 + thickness);
    mesh.add(outline);
}

// ============ Прямоугольник пола ============
function makeFloor(zone, parent) {
    const geo = new THREE.PlaneGeometry(zone.w, zone.d);
    const mat = toonMat(new THREE.Color(zone.color).getHex());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(zone.x, zone.y || 0.01, zone.z);
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

// ============ Стена ============
function makeWall(w, parent) {
    const geo = new THREE.BoxGeometry(w.w, w.h, w.d);
    const mat = toonMat(0x2a2a2a);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(w.x, w.h / 2, w.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.03);
    parent.add(mesh);

    // Сохраняем AABB для коллизий
    mesh.userData.collider = {
        minX: w.x - w.w / 2,
        maxX: w.x + w.w / 2,
        minZ: w.z - w.d / 2,
        maxZ: w.z + w.d / 2
    };
    return mesh;
}

// ============ Ящик ============
function makeCrate(c, parent) {
    const geo = new THREE.BoxGeometry(c.size, c.size, c.size);
    const mat = toonMat(0xB8B8B8);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(c.x, c.size / 2, c.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.06);
    parent.add(mesh);

    mesh.userData.collider = {
        minX: c.x - c.size / 2,
        maxX: c.x + c.size / 2,
        minZ: c.z - c.size / 2,
        maxZ: c.z + c.size / 2
    };
    return mesh;
}

// ============ Контейнер ============
function makeContainer(c, parent) {
    const geo = new THREE.BoxGeometry(c.w, c.h, c.d);
    const mat = toonMat(new THREE.Color(c.color).getHex());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(c.x, c.h / 2, c.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.04);
    parent.add(mesh);

    mesh.userData.collider = {
        minX: c.x - c.w / 2,
        maxX: c.x + c.w / 2,
        minZ: c.z - c.d / 2,
        maxZ: c.z + c.d / 2
    };
    return mesh;
}

// ============ Триггер-зона (plent) ============
function makePlant(p, parent) {
    const geo = new THREE.PlaneGeometry(p.w, p.d);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x33CC66,
        transparent: true,
        opacity: 0.4
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, 0.05, p.z);
    mesh.userData = { type: 'plant', id: p.id };
    parent.add(mesh);
    return mesh;
}

// ============ Башня ============
function makeTower(t, parent) {
    const s = t.size;
    const geo = new THREE.BoxGeometry(s, s * 2.5, s);
    const mat = toonMat(t.team === 'T' ? 0x8B0000 : 0x1E3A8A);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(t.x, s * 1.25, t.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    addOutline(mesh, 0.04);
    mesh.userData = {
        type: 'tower',
        team: t.team,
        hp: t.hp,
        maxHp: t.hp,
        collider: {
            minX: t.x - s / 2,
            maxX: t.x + s / 2,
            minZ: t.z - s / 2,
            maxZ: t.z + s / 2
        }
    };
    parent.add(mesh);
    return mesh;
}

// ============ Загрузка всей карты ============
export async function loadMap(url, parent) {
    const res = await fetch(url);
    const data = await res.json();

    const colliders = [];
    const towers = [];

    // Полы
    for (const f of data.floors) {
        makeFloor(f, parent);
    }

    // Верхний уровень
    if (data.upper) {
        for (const f of data.upper) {
            makeFloor(f, parent);
            // Бортик вокруг верхнего этажа (упрощённо)
        }
    }

    // Стены
    for (const w of data.walls) {
        const wall = makeWall(w, parent);
        colliders.push(wall.userData.collider);
    }

    // Ящики
    for (const c of data.crates) {
        const crate = makeCrate(c, parent);
        colliders.push(crate.userData.collider);
    }

    // Контейнеры
    if (data.containers) {
        for (const c of data.containers) {
            const cont = makeContainer(c, parent);
            colliders.push(cont.userData.collider);
        }
    }

    // Плэнты
    if (data.plants) {
        for (const p of data.plants) {
            makePlant(p, parent);
        }
    }

    // Башни
    for (const t of data.towers) {
        const tower = makeTower(t, parent);
        colliders.push(tower.userData.collider);
        towers.push(tower);
    }

    return { data, colliders, towers };
}
