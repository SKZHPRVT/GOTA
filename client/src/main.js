import * as THREE from 'three';
import { createArena } from './map/arena.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Joystick } from './ui/joystick.js';
import { CombatSystem } from './game/combat.js';
import { CollisionSystem } from './game/collision.js';

const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    try { tg.lockOrientation && tg.lockOrientation('landscape'); } catch (e) {}
}

const scene = new THREE.Scene();

// === ПАЛИТРА DUST2 ===
// Небо — песочное (как в CS:Source на dust2)
scene.background = new THREE.Color(0xE8D8A8);
// Туман — песочный
scene.fog = new THREE.Fog(0xE8D8A8, 100, 300);

const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 800
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Свет — тёплый песочный
scene.add(new THREE.AmbientLight(0xFFF0D0, 0.85));

const sun = new THREE.DirectionalLight(0xFFE8B0, 1.2);
sun.position.set(60, 100, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -150;
sun.shadow.camera.right = 150;
sun.shadow.camera.top = 150;
sun.shadow.camera.bottom = -150;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 500;
scene.add(sun);

const joystick = new Joystick(
    document.getElementById('joystick'),
    document.getElementById('joystick-knob')
);

const hud = document.getElementById('hud');

let player, enemies = [], combat, collision;
let USE_COLLISION = true;
let FLOORS = [];

function sortFloorsByArea() {
    return [...FLOORS].sort((a, b) => (b.w * b.d) - (a.w * a.d));
}

function safeCenter(floor, collision) {
    const c = { x: floor.x, z: floor.z };
    if (!collision || collision.canMoveTo(c.x, c.z)) return c;

    const step = 1;
    const maxX = floor.w / 2 - 1;
    const maxZ = floor.d / 2 - 1;
    for (let dz = 0; dz <= maxZ; dz += step) {
        for (let dx = 0; dx <= maxX; dx += step) {
            const candidates = [
                { x: floor.x + dx, z: floor.z + dz },
                { x: floor.x - dx, z: floor.z + dz },
                { x: floor.x + dx, z: floor.z - dz },
                { x: floor.x - dx, z: floor.z - dz }
            ];
            for (const cand of candidates) {
                if (collision.canMoveTo(cand.x, cand.z)) return cand;
            }
        }
    }
    return c;
}

async function init() {
    const { arena, colliders, data } = await createArena();
    scene.add(arena);
    collision = new CollisionSystem(colliders);
    combat = new CombatSystem(scene);

    FLOORS = data.floors || [];
    console.log('[main] floors:', FLOORS.length);

    const sorted = sortFloorsByArea();
    const bottomZones = sorted.filter(f => f.z > 0);
    const topZones = sorted.filter(f => f.z < 0);

    // Игрок — в самой большой зоне нижней половины
    const playerZone = bottomZones[0] || sorted[0];
    const spawnT = safeCenter(playerZone, collision);
    console.log('[main] spawn T:', spawnT);

    player = new Player(scene, 'T', spawnT);
    window.player = player;

    // Боты — в 3 самых больших зонах верхней половины
    const botZones = topZones.slice(0, 3);
    for (const zone of botZones) {
        const pos = safeCenter(zone, collision);
        console.log('[main] bot spawn:', pos);
        enemies.push(new Enemy(scene, 'CT', pos));
    }
    while (enemies.length < 3) {
        const zone = sorted[Math.floor(Math.random() * Math.min(6, sorted.length))];
        const pos = safeCenter(zone, collision);
        enemies.push(new Enemy(scene, 'CT', pos));
    }

    console.log('[main] enemies spawned:', enemies.length);

    camera.position.set(spawnT.x, 60, spawnT.z + 50);

    animate();
}

const cameraOffset = { y: 60, z: 50 };
function updateCamera() {
    if (!player) return;
    const t = player.mesh.position;
    camera.position.x += (t.x - camera.position.x) * 0.12;
    camera.position.z += (t.z + cameraOffset.z - camera.position.z) * 0.12;
    camera.position.y = cameraOffset.y;
    camera.lookAt(t.x, 0, t.z);
}

const clock = new THREE.Clock();
let kills = 0;
let debugTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (!player) return;

    const collisionRef = USE_COLLISION ? collision : null;
    player.update(dt, joystick.direction, collisionRef);

    debugTimer += dt;
    if (debugTimer > 1) {
        debugTimer = 0;
        console.log(
            '[debug] pos:', player.mesh.position.x.toFixed(2), player.mesh.position.z.toFixed(2),
            '| js:', joystick.direction.x.toFixed(2), joystick.direction.y.toFixed(2),
            '| col:', USE_COLLISION
        );
    }

    // Игрок стреляет только если есть LOS
    if (player.alive) {
        const target = combat.findNearestTarget(
            player.mesh.position, enemies, player.attackRange
        );
        if (target && collision) {
            const fromPos = player.mesh.position;
            const toPos = target.mesh.position;
            if (collision.hasLineOfSight(fromPos, toPos)) {
                player.faceTarget(toPos);
                player.attackTimer -= dt;
                if (player.attackTimer <= 0) {
                    player.attackTimer = player.attackCooldown;
                    combat.shoot(fromPos, target, 'T');
                }
            } else {
                player.faceTarget(toPos);
            }
        }
    }

    // Боты стреляют только если есть LOS
    for (const enemy of enemies) {
        if (!enemy.alive) continue;
        let hasLOS = true;
        if (collision) {
            hasLOS = collision.hasLineOfSight(
                enemy.mesh.position,
                player.mesh.position
            );
        }
        const action = enemy.update(dt, player.mesh.position, collisionRef, hasLOS);
        if (action && action.type === 'shoot') {
            const startPos = action.from.clone().sub(new THREE.Vector3(0, 1.2, 0));
            const fakeTarget = {
                mesh: {
                    position: action.from.clone().add(
                        action.direction.clone().multiplyScalar(10)
                    )
                }
            };
            combat.shoot(startPos, fakeTarget, 'CT');
        }
    }

    combat.update(dt, enemies, player);

    for (let i = 0; i < enemies.length; i++) {
        if (!enemies[i].alive) {
            kills++;
            const sorted = sortFloorsByArea();
            const topZones = sorted.filter(f => f.z < 0);
            const zone = topZones[Math.floor(Math.random() * Math.min(5, topZones.length))];
            const pos = zone ? safeCenter(zone, collision) : { x: 0, z: -42 };
            enemies[i] = new Enemy(scene, 'CT', pos);
        }
    }

    hud.textContent = `GOta | HP: ${Math.round(player.hp)} | Kills: ${kills} | Col: ${USE_COLLISION ? 'ON' : 'OFF'}`;

    updateCamera();
    renderer.render(scene, camera);
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') {
        USE_COLLISION = !USE_COLLISION;
        console.log('[debug] collision:', USE_COLLISION);
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
