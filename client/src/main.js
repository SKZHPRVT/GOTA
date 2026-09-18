import * as THREE from 'three';
import { createArena } from './map/arena.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Joystick } from './ui/joystick.js';
import { CombatSystem } from './game/combat.js';
import { CollisionSystem } from './game/collision.js';

// Telegram
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    try { tg.lockOrientation && tg.lockOrientation('landscape'); } catch (e) {}
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xC2B280);
scene.fog = new THREE.Fog(0xC2B280, 40, 140);

const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 400
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Свет
scene.add(new THREE.AmbientLight(0xffffff, 0.75));

const sun = new THREE.DirectionalLight(0xfff2cc, 1.1);
sun.position.set(40, 60, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 250;
scene.add(sun);

// Джойстик
const joystick = new Joystick(
    document.getElementById('joystick'),
    document.getElementById('joystick-knob')
);

// HUD
const hud = document.getElementById('hud');

// Всё остальное — после загрузки карты
let player, enemies = [], combat, collision;

async function init() {
    const { arena, colliders, data } = await createArena();
    scene.add(arena);
    collision = new CollisionSystem(colliders);
    combat = new CombatSystem(scene);

    const spawnT = data.spawns.T;
    const spawnCT = data.spawns.CT;

    player = new Player(scene, 'T', spawnT);

    // Спавним 3 врага вокруг CT spawn
    for (let i = 0; i < 3; i++) {
        const e = new Enemy(scene, 'CT', {
            x: spawnCT.x + (i - 1) * 5,
            z: spawnCT.z
        });
        enemies.push(e);
    }

    // Камера
    camera.position.set(spawnT.x, 22, spawnT.z + 18);

    animate();
}

// Камера следует
const cameraOffset = { y: 22, z: 18 };
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

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (!player) return;

    player.update(dt, joystick.direction, collision);

    if (player.alive) {
        const target = combat.findNearestTarget(
            player.mesh.position, enemies, player.attackRange
        );
        if (target) {
            player.faceTarget(target.mesh.position);
            player.attackTimer -= dt;
            if (player.attackTimer <= 0) {
                player.attackTimer = player.attackCooldown;
                combat.shoot(player.mesh.position, target, 'T');
            }
        }
    }

    for (const enemy of enemies) {
        if (!enemy.alive) continue;
        const action = enemy.update(dt, player.mesh.position, collision);
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

    // Респавн
    for (let i = 0; i < enemies.length; i++) {
        if (!enemies[i].alive) {
            kills++;
            enemies[i] = new Enemy(scene, 'CT', {
                x: -20 + Math.random() * 40,
                z: 15 + Math.random() * 15
            });
        }
    }

    hud.textContent = `GOta | HP: ${Math.round(player.hp)} | Kills: ${kills}`;

    updateCamera();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();
