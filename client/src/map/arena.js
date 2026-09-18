import * as THREE from 'three';

// ============ ПАЛИТРА (Minigore-стиль) ============
const COLORS = {
    floor:      0xA89870,  // тёмный песок
    floorAlt:   0xB8A880,  // светлый песок (клетка)
    wall:       0x9B8567,  // стена песочная
    wallDark:   0x6B5335,  // тёмная стена
    wallLight:  0xC2B280,  // светлая стена
    crate:      0xB8B8B8,  // светло-серый ящик
    container:  0x4CAF50,  // зелёный контейнер
    plantA:     0xCC3333,  // красный триггер
    plantB:     0x3366CC,  // синий триггер
    plantC:     0x33CC66,  // зелёный триггер
    triggerOrange: 0xFF8800,
    triggerGreen:  0x00CC44,
    towerT:     0x8B0000,
    towerCT:    0x1E3A8A
};

const CELL = 4;      // 1 клетка = 4 юнита
const HALF = 8;      // карта от -8 до +8 клеток (16x16)
const H = 4;         // высота стен
const WORLD = HALF * CELL; // 32 юнита в половину

// ============ TOON-МАТЕРИАЛ + КОНТУР ============
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
    return new THREE.MeshToonMaterial({
        color,
        gradientMap: toonGradient
    });
}

// Контур — back-side копия, чуть больше, чёрная
function addOutline(mesh, thickness = 0.06) {
    const outlineMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        side: THREE.BackSide
    });
    const outline = new THREE.Mesh(mesh.geometry, outlineMat);
    outline.scale.multiplyScalar(1 + thickness);
    mesh.add(outline);
}

function box(w, h, d, color, x, y, z, parent, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = toonMat(color);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (opts.outline !== false) addOutline(mesh);
    if (opts.userData) mesh.userData = opts.userData;
    parent.add(mesh);
    return mesh;
}

// Перевести координаты клеток в мировые
// Клетки: A..P (x: 0..15), 1..16 (z: 0..15)
// Центр карты (7.5, 7.5) → мировая (0, 0)
function cellToWorld(col, row) {
    return {
        x: (col - 7.5) * CELL,
        z: (row - 7.5) * CELL
    };
}

// Построить блок из диапазона клеток (col1..col2, row1..row2)
// col1/row1 — включительно, col2/row2 — включительно
function blockCells(col1, row1, col2, row2, color, parent, height = H, y = null) {
    const w = (col2 - col1 + 1) * CELL;
    const d = (row2 - row1 + 1) * CELL;
    const cx = (col1 + col2) / 2 - 7.5;
    const cz = (row1 + row2) / 2 - 7.5;
    const h = height;
    const py = y !== null ? y : h / 2;
    return box(w, h, d, color, cx * CELL, py, cz * CELL, parent);
}

// ============ КАРТА ============
export function createArena() {
    const arena = new THREE.Group();

    // === Пол (16x16 клеток) ===
    const floorSize = 16 * CELL;
    const floorGeo = new THREE.PlaneGeometry(floorSize, floorSize);
    const floorMat = toonMat(COLORS.floor);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    arena.add(floor);

    // Шахматная подсветка для чтения клеток
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < 16; j++) {
            if ((i + j) % 2 !== 0) continue;
            const tile = new THREE.Mesh(
                new THREE.PlaneGeometry(CELL, CELL),
                toonMat(COLORS.floorAlt)
            );
            tile.rotation.x = -Math.PI / 2;
            const w = cellToWorld(i, j);
            tile.position.set(w.x, 0.01, w.z);
            arena.add(tile);
        }
    }

    // === ГРАНИЦЫ КАРТЫ (вокруг всей площади) ===
    const edge = floorSize / 2;
    // Верхняя стена (row = 0, за картой)
    blockCells(0, -1, 15, -1, COLORS.wallDark, arena);
    // Нижняя
    blockCells(0, 16, 15, 16, COLORS.wallDark, arena);
    // Левая
    blockCells(-1, 0, -1, 15, COLORS.wallDark, arena);
    // Правая
    blockCells(16, 0, 16, 15, COLORS.wallDark, arena);

    // === ВЕРХНЯЯ ЧАСТЬ (ряды 0-3) ===

    // Верхний левый спавн (A1-B4) — комната с оранжевым контуром
    // Стены комнаты
    blockCells(0, 0, 2, 0, COLORS.wall, arena);          // верх
    blockCells(0, 0, 0, 3, COLORS.wall, arena);          // лево
    blockCells(2, 0, 2, 1, COLORS.wall, arena);          // правая верхняя стенка
    blockCells(2, 3, 2, 3, COLORS.wall, arena);          // правая нижняя стенка (выход в B4)
    // Ящики внутри спавна
    box(2, 2, 2, COLORS.crate, cellToWorld(1, 1).x, 1, cellToWorld(1, 1).z, arena);
    box(2, 2, 2, COLORS.crate, cellToWorld(1, 2).x, 1, cellToWorld(1, 2).z, arena);
    // Оранжевый триггер (пол)
    const trigT = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL * 2, CELL * 2),
        new THREE.MeshBasicMaterial({ color: COLORS.triggerOrange, transparent: true, opacity: 0.4 })
    );
    trigT.rotation.x = -Math.PI / 2;
    trigT.position.set(cellToWorld(1, 1.5).x, 0.02, cellToWorld(1, 1.5).z);
    arena.add(trigT);

    // Верхний центр (C3-F4) — горизонтальный коридор
    // Оставляем проход, добавляем стены сверху и снизу коридора
    blockCells(3, 0, 5, 0, COLORS.wall, arena);          // верхняя стенка
    blockCells(3, 4, 5, 4, COLORS.wall, arena);          // нижняя стенка
    // Зелёный контейнер в E3
    box(3, 3, 3, COLORS.container, cellToWorld(4, 2).x, 1.5, cellToWorld(4, 2).z, arena);

    // Верхний правый спавн (L1-O4) — зеркало левого
    blockCells(13, 0, 15, 0, COLORS.wall, arena);        // верх
    blockCells(15, 0, 15, 3, COLORS.wall, arena);        // право
    blockCells(13, 0, 13, 1, COLORS.wall, arena);        // левая верхняя
    blockCells(13, 3, 13, 3, COLORS.wall, arena);        // левая нижняя
    // Ящики
    box(2, 2, 2, COLORS.crate, cellToWorld(14, 1).x, 1, cellToWorld(14, 1).z, arena);
    box(2, 2, 2, COLORS.crate, cellToWorld(14, 2).x, 1, cellToWorld(14, 2).z, arena);
    // Оранжевый триггер
    const trigCT = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL * 2, CELL * 2),
        new THREE.MeshBasicMaterial({ color: COLORS.triggerOrange, transparent: true, opacity: 0.4 })
    );
    trigCT.rotation.x = -Math.PI / 2;
    trigCT.position.set(cellToWorld(14, 1.5).x, 0.02, cellToWorld(14, 1.5).z);
    arena.add(trigCT);
    // Зелёный контейнер в M3
    box(3, 3, 3, COLORS.container, cellToWorld(12, 2).x, 1.5, cellToWorld(12, 2).z, arena);

    // === ЦЕНТРАЛЬНАЯ ЧАСТЬ (ряды 5-9) ===

    // Левая сторона (A5-C9) — лабиринт
    blockCells(0, 5, 0, 9, COLORS.wall, arena);          // колонна A
    blockCells(1, 6, 1, 7, COLORS.wall, arena);          // B6-B7
    blockCells(2, 5, 2, 5, COLORS.wall, arena);
    blockCells(2, 9, 2, 9, COLORS.wall, arena);
    // Полукруглый угол B7 (упрощённо — небольшой блок)
    box(1.5, H, 1.5, COLORS.wallLight, cellToWorld(1.5, 7.5).x, H/2, cellToWorld(1.5, 7.5).z, arena);
    // Ящики вдоль
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(2, 6).x, 0.75, cellToWorld(2, 6).z, arena);
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(2, 8).x, 0.75, cellToWorld(2, 8).z, arena);

    // Центр (D-J, 5-9) — большая вертикальная стена F7-G8
    blockCells(5, 5, 6, 9, COLORS.wallDark, arena);      // стена F7-G8 (примерно)
    // Контейнер H6
    box(3, 3, 3, COLORS.container, cellToWorld(7, 5).x, 1.5, cellToWorld(7, 5).z, arena);
    // Отдельные ящики в центре
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(3, 6).x, 0.75, cellToWorld(3, 6).z, arena);
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(3, 7).x, 0.75, cellToWorld(3, 7).z, arena);
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(8, 6).x, 0.75, cellToWorld(8, 6).z, arena);
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(8, 8).x, 0.75, cellToWorld(8, 8).z, arena);

    // Правая сторона (K-P, 5-9)
    blockCells(15, 5, 15, 9, COLORS.wall, arena);        // правый край
    blockCells(12, 5, 12, 5, COLORS.wall, arena);
    blockCells(11, 6, 11, 8, COLORS.wall, arena);        // L-образный коридор
    // Комната O6 с ящиками
    blockCells(13, 5, 14, 5, COLORS.wall, arena);
    blockCells(13, 8, 14, 8, COLORS.wall, arena);
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(13, 6).x, 0.75, cellToWorld(13, 6).z, arena);
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(13, 7).x, 0.75, cellToWorld(13, 7).z, arena);

    // === НИЖНЯЯ ЧАСТЬ (ряды 10-15) ===

    // Нижний левый (A11-D15) — L-образная зона
    blockCells(0, 11, 0, 15, COLORS.wall, arena);        // левая стенка
    blockCells(0, 15, 3, 15, COLORS.wall, arena);        // нижняя
    blockCells(2, 11, 3, 11, COLORS.wall, arena);        // верхняя часть

    // Г-образные ящики в C12
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(2, 12).x, 0.75, cellToWorld(2, 12).z, arena);
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(2, 13).x, 0.75, cellToWorld(2, 13).z, arena);
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(3, 13).x, 0.75, cellToWorld(3, 13).z, arena);

    // Зелёный триггер D15-E16 (бомб-сайт)
    const plantB = new THREE.Mesh(
        new THREE.PlaneGeometry(CELL * 2, CELL * 2),
        new THREE.MeshBasicMaterial({ color: COLORS.triggerGreen, transparent: true, opacity: 0.5 })
    );
    plantB.rotation.x = -Math.PI / 2;
    plantB.position.set(cellToWorld(3.5, 14.5).x, 0.02, cellToWorld(3.5, 14.5).z);
    arena.add(plantB);

    // Нижний центр (E-H, 11-13) — два острова
    blockCells(4, 11, 4, 13, COLORS.wall, arena);        // остров 1
    blockCells(7, 11, 7, 13, COLORS.wall, arena);        // остров 2
    // Коридор между ними — проход

    // Нижний правый (I-P, 11-15)
    blockCells(15, 11, 15, 15, COLORS.wall, arena);      // правый край
    blockCells(12, 11, 14, 11, COLORS.wall, arena);      // верхняя
    blockCells(12, 14, 14, 14, COLORS.wall, arena);      // нижняя
    blockCells(12, 12, 12, 13, COLORS.wall, arena);      // левая
    blockCells(14, 12, 14, 13, COLORS.wall, arena);      // правая
    // Ящики внутри
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(13, 12).x, 0.75, cellToWorld(13, 12).z, arena);
    box(1.5, 1.5, 1.5, COLORS.crate, cellToWorld(13, 13).x, 0.75, cellToWorld(13, 13).z, arena);

    // === БАШНИ (вместо плэнтов-точек — T и CT) ===
    // Башня T в верхней части (спавн T)
    const towerT = box(3, 8, 3, COLORS.towerT,
        cellToWorld(1, 1.5).x, 4, cellToWorld(1, 1.5).z, arena,
        { userData: { type: 'tower', team: 'T', hp: 1000, maxHp: 1000 } });

    // Башня CT в нижней части (спавн CT)
    const towerCT = box(3, 8, 3, COLORS.towerCT,
        cellToWorld(14, 13.5).x, 4, cellToWorld(14, 13.5).z, arena,
        { userData: { type: 'tower', team: 'CT', hp: 1000, maxHp: 1000 } });

    return arena;
}
