#!/usr/bin/env node
import fs from 'fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node convert-radar.js <input.png> <output.json> [cols] [rows] [scale]');
    process.exit(1);
}

const INPUT = args[0];
const OUTPUT = args[1];
const COLS = parseInt(args[2] || '80', 10);
const ROWS = parseInt(args[3] || '64', 10);
const SCALE = parseFloat(args[4] || '2');

const WORLD_W = 80 * SCALE;
const WORLD_D = 64 * SCALE;
const UNIT_X = WORLD_W / COLS;
const UNIT_Z = WORLD_D / ROWS;

// ==== ПРОСТАЯ классификация: только void / не-void ====
// Всё не-чёрное → floor. Оттенки для красоты.
function classify(r, g, b) {
    const brightness = (r + g + b) / 3;
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const sat = maxc - minc;

    if (brightness < 20) return 'void';

    // Зелёный (T/CT спавн)
    if (g > r + 10 && g > b + 10 && sat > 10 && g > 55) return 't_spawn';

    // Оранжевый/коричневый (сайты, коридоры)
    if (r > 100 && r > g + 10 && r > b + 20) return 'corridor';

    // Всё остальное — пол
    return 'floor';
}

const COLORS = {
    t_spawn:  '#4a6a3a',
    corridor: '#7a5a3a',
    floor:    '#7a7a7a'
};

async function buildGrid(file, cols, rows) {
    const { data, info } = await sharp(file)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;

    const cellW = width / cols;
    const cellH = height / rows;

    const grid = [];
    for (let ry = 0; ry < rows; ry++) {
        const row = [];
        for (let cx = 0; cx < cols; cx++) {
            let sumR = 0, sumG = 0, sumB = 0, count = 0;
            const x0 = Math.floor(cx * cellW);
            const x1 = Math.floor((cx + 1) * cellW);
            const y0 = Math.floor(ry * cellH);
            const y1 = Math.floor((ry + 1) * cellH);

            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const idx = (y * width + x) * channels;
                    sumR += data[idx];
                    sumG += data[idx + 1];
                    sumB += data[idx + 2];
                    count++;
                }
            }
            row.push(classify(sumR / count, sumG / count, sumB / count));
        }
        grid.push(row);
    }
    return grid;
}

// Denoise: убираем одиночные void-клетки внутри пола
function denoiseGrid(grid, cols, rows) {
    const result = grid.map(row => row.slice());
    let changes = 0;

    for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
            if (grid[y][x] !== 'void') continue;
            let solid = 0;
            if (grid[y-1][x] !== 'void') solid++;
            if (grid[y+1][x] !== 'void') solid++;
            if (grid[y][x-1] !== 'void') solid++;
            if (grid[y][x+1] !== 'void') solid++;
            if (solid >= 3) {
                const counts = {};
                for (const t of [grid[y-1][x], grid[y+1][x], grid[y][x-1], grid[y][x+1]]) {
                    if (t !== 'void') counts[t] = (counts[t] || 0) + 1;
                }
                let best = 'floor', bestC = 0;
                for (const t in counts) if (counts[t] > bestC) { bestC = counts[t]; best = t; }
                result[y][x] = best;
                changes++;
            }
        }
    }

    for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
            if (grid[y][x] === 'void') continue;
            let voids = 0;
            if (grid[y-1][x] === 'void') voids++;
            if (grid[y+1][x] === 'void') voids++;
            if (grid[y][x-1] === 'void') voids++;
            if (grid[y][x+1] === 'void') voids++;
            if (voids >= 3) {
                result[y][x] = 'void';
                changes++;
            }
        }
    }

    console.log('Denoise changes:', changes);
    return result;
}

function greedyMesh(grid, cols, rows) {
    const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
    const rects = [];

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (visited[y][x]) continue;
            const type = grid[y][x];
            if (type === 'void') { visited[y][x] = true; continue; }

            let w = 0;
            while (x + w < cols && !visited[y][x + w] && grid[y][x + w] === type) w++;

            let h = 1;
            outer: while (y + h < rows) {
                for (let k = 0; k < w; k++) {
                    if (visited[y + h][x + k] || grid[y + h][x + k] !== type) break outer;
                }
                h++;
            }

            for (let dy = 0; dy < h; dy++)
                for (let dx = 0; dx < w; dx++)
                    visited[y + dy][x + dx] = true;

            rects.push({ x, y, w, h, type });
        }
    }
    return rects;
}

// Стены — по границам void ↔ пол
function buildWallsFromGrid(grid, cols, rows) {
    const walls = [];
    const WALL_T = 0.5;
    const WALL_H = 4;
    let id = 0;

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            if (grid[y][x] === 'void') continue;

            const wx = (x + 0.5 - cols / 2) * UNIT_X;
            const wz = (y + 0.5 - rows / 2) * UNIT_Z;

            const neighbors = [
                { dx: -1, dz: 0, w: WALL_T, d: UNIT_Z, x: wx - UNIT_X / 2, z: wz },
                { dx: 1,  dz: 0, w: WALL_T, d: UNIT_Z, x: wx + UNIT_X / 2, z: wz },
                { dx: 0,  dz: -1, w: UNIT_X, d: WALL_T, x: wx, z: wz - UNIT_Z / 2 },
                { dx: 0,  dz: 1,  w: UNIT_X, d: WALL_T, x: wx, z: wz + UNIT_Z / 2 }
            ];

            for (const n of neighbors) {
                const nx = x + n.dx;
                const ny = y + n.dz;
                const outside = nx < 0 || nx >= cols || ny < 0 || ny >= rows;
                const isVoid = outside || grid[ny][nx] === 'void';
                if (isVoid) {
                    walls.push({
                        id: 'w' + (id++),
                        x: Math.round(n.x * 100) / 100,
                        z: Math.round(n.z * 100) / 100,
                        w: Math.round(n.w * 100) / 100,
                        d: Math.round(n.d * 100) / 100,
                        h: WALL_H
                    });
                }
            }
        }
    }
    return walls;
}

function buildFloors(rects, cols, rows) {
    const floors = [];
    for (const r of rects) {
        if (r.w < 1 || r.h < 1) continue;
        const cx = (r.x + r.w / 2 - cols / 2) * UNIT_X;
        const cz = (r.y + r.h / 2 - rows / 2) * UNIT_Z;
        floors.push({
            id: `${r.type}_${r.x}_${r.y}`,
            x: Math.round(cx * 100) / 100,
            z: Math.round(cz * 100) / 100,
            w: Math.round(r.w * UNIT_X * 100) / 100,
            d: Math.round(r.h * UNIT_Z * 100) / 100,
            color: COLORS[r.type] || COLORS.floor
        });
    }
    return floors;
}

// Спавн: самая большая зона типа в нужной половине
function findBiggestZone(rects, cols, rows, type, preferBottom) {
    let best = null, bestArea = 0;
    for (const r of rects) {
        if (r.type !== type) continue;
        const cy = r.y + r.h / 2;
        if (preferBottom && cy < rows / 2) continue;
        if (!preferBottom && cy > rows / 2) continue;
        const area = r.w * r.h;
        if (area > bestArea) { bestArea = area; best = r; }
    }
    if (!best) {
        for (const r of rects) if (r.type === type) { best = r; break; }
    }
    if (!best) return { x: 0, z: preferBottom ? WORLD_D / 2 - 8 : -WORLD_D / 2 + 8 };

    const cx = (best.x + best.w / 2 - cols / 2) * UNIT_X;
    const cz = (best.y + best.h / 2 - rows / 2) * UNIT_Z;
    return {
        x: Math.round(cx * 100) / 100,
        z: Math.round(cz * 100) / 100
    };
}

async function main() {
    console.log('Reading radar:', INPUT);
    let grid = await buildGrid(INPUT, COLS, ROWS);

    console.log('Denoising...');
    grid = denoiseGrid(grid, COLS, ROWS);

    let stats = {};
    for (const row of grid) for (const t of row) stats[t] = (stats[t] || 0) + 1;
    console.log('Grid stats:', stats);

    console.log('Greedy meshing...');
    const rects = greedyMesh(grid, COLS, ROWS);
    console.log('Found rects:', rects.length);

    console.log('Building walls...');
    const walls = buildWallsFromGrid(grid, COLS, ROWS);
    console.log('Found walls:', walls.length);

    const floors = buildFloors(rects, COLS, ROWS);

    const spawnT = findBiggestZone(rects, COLS, ROWS, 't_spawn', true);
    const spawnCT = findBiggestZone(rects, COLS, ROWS, 't_spawn', false);

    const json = {
        name: 'dust2',
        worldSize: { width: WORLD_W, depth: WORLD_D },
        wallHeight: 4,
        floors,
        walls,
        crates: [],
        containers: [],
        plants: [],
        towers: [],
        spawns: { T: spawnT, CT: spawnCT }
    };

    fs.writeFileSync(OUTPUT, JSON.stringify(json, null, 2));
    console.log('Written:', OUTPUT);
    console.log('Floors:', floors.length);
    console.log('Walls:', walls.length);
    console.log('Spawn T:', spawnT);
    console.log('Spawn CT:', spawnCT);
}

main().catch((e) => { console.error(e); process.exit(1); });
