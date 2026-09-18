import * as THREE from 'three';
import { createArena } from './map/arena.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Joystick } from './ui/joystick.js';
import { CombatSystem } from './game/combat.js';
import { CollisionSystem } from './game/collision.js';
import { RoundManager } from './game/round.js';

// Telegram
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    try { tg.lockOrientation && tg.lockOrientation('landscape'); } catch (e) {}
}

// === Сцена ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xE8D8A8);
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

// Свет
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

// UI
const joystick = new Joystick(
    document.getElementById('joystick'),
    document.getElementById('joystick-knob')
);
const scoreTEl = document.getElementById('score-t');
const scoreCTEl = document.getElementById('score-ct');
const roundTimerEl = document.getElementById('round-timer');
const roundInfoEl = document.getElementById('round-info');
const hpEl = document.getElementById('hp-hud');
const bannerEl = document.getElementById('banner');

// Кнопки способностей
const abilityBombEl = document.getElementById('ability-1');
const abilityHammerEl = document.getElementById('ability-2');

// === Игровое состояние ===
let player;
let tBots = [];   // союзники (команда T)
let ctBots = [];  // враги (команда CT)
let combat;
let collision;
let USE_COLLISION = true;

// Спавны, плэнты из JSON
let spawnT = { x: 28.5, z: 45 };
let spawnCT = { x: -25.5, z: -57 };
let plants = [];
let FLOORS = [];

// RoundManager
const round = new RoundManager({
    roundsToWin: 5,
    roundDuration: 60,
    betweenRounds: 3,
    onRoundStart: (n) => {
        console.log('[main] round start', n);
        showBanner(`Раунд ${n}`, '#FFD24A', 1.5);
        resetRound();
    },
    onRoundEnd: (winner, reason, sT, sCT) => {
        console.log('[main] round end', winner, reason);
        const color = winner === 'T' ? '#FFD24A' : '#5CA8FF';
        const text = winner === 'T' ? 'Победа T!' : 'Победа CT!';
        showBanner(text, color, 2);
        updateScore(sT, sCT);
    },
    onMatchEnd: (winner, sT, sCT) => {
        const text = winner === 'T' ? 'МАТЧ: T ПОБЕДА!' : 'МАТЧ: CT ПОБЕДА!';
        const color = winner === 'T' ? '#FFD24A' : '#5CA8FF';
        showBanner(text, color, 999);
    }
});

function showBanner(text, color, duration) {
    bannerEl.textContent = text;
    bannerEl.style.color = color;
    bannerEl.style.display = 'block';
    if (duration < 900) {
        setTimeout(() => {
            bannerEl.style.display = 'none';
        }, duration * 1000);
    }
}

function updateScore(sT, sCT) {
    scoreTEl.textContent = `T ${sT}`;
    scoreCTEl.textContent = `CT ${sCT}`;
}

// === Инициализация ===
async function init() {
    const { arena, colliders, data } = await createArena();
    scene.add(arena);
    collision = new CollisionSystem(colliders);
    combat = new CombatSystem(scene);

    FLOORS = data.floors || [];
    spawnT = data.spawns?.T || spawnT;
    spawnCT = data.spawns?.CT || spawnCT;
    plants = data.plants || [];

    console.log('[main] spawn T:', spawnT, 'CT:', spawnCT);
    console.log('[main] plants:', plants);

    // Игрок — T-команда
    player = new Player(scene, 'T', spawnT);
    window.player = player;

    createTeams();

    // Кнопки способностей
    abilityBombEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        tryPlaceBomb();
    });
    abilityBombEl.addEventListener('click', (e) => {
        tryPlaceBomb();
    });
    abilityHammerEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        tryHammer();
    });
    abilityHammerEl.addEventListener('click', (e) => {
        tryHammer();
    });

    // Камера
    camera.position.set(spawnT.x, 45, spawnT.z + 35);

    // Старт первого раунда
    setTimeout(() => round.start(), 500);

    animate();
}

function createTeams() {
    // Убираем старых
    for (const b of tBots) b.die();
    for (const b of ctBots) b.die();
    tBots = [];
    ctBots = [];

    // 4 T-бота (союзники) вокруг spawnT
    for (let i = 0; i < 4; i++) {
        const off = [
            { x: -4, z: 3 }, { x: 4, z: 3 },
            { x: -6, z: -3 }, { x: 6, z: -3 }
        ][i];
        tBots.push(new Enemy(scene, 'T', {
            x: spawnT.x + off.x,
            z: spawnT.z + off.z
        }));
    }

    // 5 CT-ботов вокруг spawnCT
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const r = 5;
        ctBots.push(new Enemy(scene, 'CT', {
            x: spawnCT.x + Math.cos(angle) * r,
            z: spawnCT.z + Math.sin(angle) * r
        }));
    }
}

function resetRound() {
    // Возрождаем игрока
    player.hp = player.maxHp;
    player.alive = true;
    player.mesh.position.set(spawnT.x, 0, spawnT.z);

    // Убираем старых ботов
    for (const b of tBots) b.die();
    for (const b of ctBots) b.die();
    tBots = [];
    ctBots = [];

    // Расстановка
    createTeams();

    round.roundTimer = round.roundDuration;
}

// === Кнопки ===

// Установить бомбу — только в зоне плэнта
function tryPlaceBomb() {
    if (!player.alive) return;
    if (!round.isPlaying()) return;

    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;

    let nearPlant = null;
    for (const p of plants) {
        const d = Math.hypot(px - p.x, pz - p.z);
        if (d < 10) { nearPlant = p; break; }
    }

    if (!nearPlant) {
        showBanner('Не на плэнте!', '#FF6666', 1);
        console.log('[bomb] not at plant');
        return;
    }

    console.log('[bomb] placed at', nearPlant.id);
    showBanner(`💣 Бомба на ${nearPlant.id}!`, '#FFD24A', 2);
    // TODO: этап 2 — таймер бомбы и логика
}

// Молоток — удар по башне
function tryHammer() {
    if (!player.alive) return;
    console.log('[hammer] hit');
    showBanner('🔨 Удар!', '#FFFFFF', 0.5);
    // TODO: этап 2 — урон башне
}

// === Камера ===
const cameraOffset = { y: 45, z: 35 };
function updateCamera() {
    if (!player) return;
    const t = player.mesh.position;
    camera.position.x += (t.x - camera.position.x) * 0.12;
    camera.position.z += (t.z + cameraOffset.z - camera.position.z) * 0.12;
    camera.position.y = cameraOffset.y;
    camera.lookAt(t.x, 0, t.z);
}

// === Цикл ===
const clock = new THREE.Clock();
let debugTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (!player) return;

    const collisionRef = USE_COLLISION ? collision : null;
    const playing = round.isPlaying();

    // Игрок двигается только в раунде
    if (playing) {
        player.update(dt, joystick.direction, collisionRef);
    }

    debugTimer += dt;
    if (debugTimer > 1) {
        debugTimer = 0;
        console.log(
            '[debug] pos:', player.mesh.position.x.toFixed(1), player.mesh.position.z.toFixed(1),
            '| alive T:', tBots.filter(b => b.alive).length,
            '| alive CT:', ctBots.filter(b => b.alive).length,
            '| round:', round.roundNumber, '| state:', round.state
        );
    }

    // Все боты в одном списке для поиска целей
    const allBots = [...tBots, ...ctBots];

    // Игрок стреляет
    if (player.alive && playing) {
        const enemiesForPlayer = ctBots.filter(b => b.alive);
        const target = combat.findNearestTarget(
            player.mesh.position, enemiesForPlayer, player.attackRange
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
            }
        }
    }

    // Логика T-ботов (союзники)
    if (playing) {
        for (const bot of tBots) {
            if (!bot.alive) continue;
            const hasLOS = collision
                ? (a, b) => collision.hasLineOfSight(a, b)
                : () => true;
            const action = bot.update(
                dt, allBots, player.mesh.position, player.alive, collisionRef, hasLOS
            );
            if (action && action.type === 'shoot') {
                const fakeTarget = {
                    mesh: {
                        position: action.from.clone().add(
                            action.direction.clone().multiplyScalar(10)
                        )
                    }
                };
                combat.shoot(action.from.clone().sub(new THREE.Vector3(0, 1.2, 0)), fakeTarget, 'T');
            }
        }

        // Логика CT-ботов (враги)
        for (const bot of ctBots) {
            if (!bot.alive) continue;
            const hasLOS = collision
                ? (a, b) => collision.hasLineOfSight(a, b)
                : () => true;
            const action = bot.update(
                dt, allBots, player.mesh.position, player.alive, collisionRef, hasLOS
            );
            if (action && action.type === 'shoot') {
                const fakeTarget = {
                    mesh: {
                        position: action.from.clone().add(
                            action.direction.clone().multiplyScalar(10)
                        )
                    }
                };
                combat.shoot(action.from.clone().sub(new THREE.Vector3(0, 1.2, 0)), fakeTarget, 'CT');
            }
        }
    }

    // Пули
    combat.update(dt, [...ctBots, ...tBots], player);

    // Проверка конца раунда
    const aliveT = tBots.filter(b => b.alive).length + (player.alive ? 1 : 0);
    const aliveCT = ctBots.filter(b => b.alive).length;
    round.update(dt, aliveT, aliveCT);

    // HUD
    hpEl.textContent = `HP: ${Math.round(player.hp)}`;
    roundTimerEl.textContent = Math.ceil(round.roundTimer);
    roundInfoEl.textContent = `Раунд ${round.roundNumber} / ${round.roundsToWin}`;

    // Кнопка бомбы — активна только рядом с плэнтом
    if (player.alive && playing) {
        const px = player.mesh.position.x;
        const pz = player.mesh.position.z;
        let nearPlant = false;
        for (const p of plants) {
            const d = Math.hypot(px - p.x, pz - p.z);
            if (d < 10) { nearPlant = true; break; }
        }
        if (nearPlant) {
            abilityBombEl.classList.add('active');
            abilityBombEl.classList.remove('inactive');
        } else {
            abilityBombEl.classList.remove('active');
            abilityBombEl.classList.add('inactive');
        }
    } else {
        abilityBombEl.classList.remove('active');
        abilityBombEl.classList.add('inactive');
    }

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
