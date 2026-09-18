import * as THREE from 'three';
import { createArena } from './map/arena.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Joystick } from './ui/joystick.js';
import { CombatSystem } from './game/combat.js';
import { CollisionSystem } from './game/collision.js';
import { RoundManager } from './game/round.js';
import { AudioManager } from './game/audio.js';

// === Telegram ===
const tg = window.Telegram?.WebApp;
if (tg) {
    try {
        tg.ready();
        tg.expand();
        if (tg.requestFullscreen) tg.requestFullscreen();
        if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
        if (tg.setHeaderColor) tg.setHeaderColor('#000000');
        if (tg.setBackgroundColor) tg.setBackgroundColor('#C2B280');
    } catch (e) {}
}

// === AUDIO ===
const audio = new AudioManager();
audio.preloadAll();
document.addEventListener('touchstart', () => audio.unlock());
document.addEventListener('click', () => audio.unlock());

// === Debug ===
const showDebug = new URLSearchParams(window.location.search).get('debug') === '1';

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
const scoreTEl = document.getElementById('score-t');
const scoreCTEl = document.getElementById('score-ct');
const roundTimerEl = document.getElementById('round-timer');
const roundInfoEl = document.getElementById('round-info');
const hpEl = document.getElementById('hp-hud');
const bannerEl = document.getElementById('banner');
const abilityBombEl = document.getElementById('ability-1');
const abilityHammerEl = document.getElementById('ability-2');

// === DEBUG-панель на экране (внизу слева) ===
const debugBombEl = document.createElement('div');
debugBombEl.style.cssText = `
    position: fixed;
    bottom: 200px;
    left: 30px;
    background: rgba(0,0,0,0.75);
    color: #0f0;
    font-size: 12px;
    padding: 6px 10px;
    border-radius: 6px;
    z-index: 50;
    font-family: monospace;
    pointer-events: none;
    white-space: pre;
    line-height: 1.4;
`;
document.body.appendChild(debugBombEl);

let debugBombMsg = '';
function logBomb(msg) {
    debugBombMsg = msg;
    debugBombEl.textContent = msg;
    console.log('[bomb]', msg);
    clearTimeout(logBomb._t);
    logBomb._t = setTimeout(() => {
        debugBombEl.textContent = '';
    }, 4000);
}

// === Игровое состояние ===
let player;
let tBots = [];
let ctBots = [];
let combat;
let collision;
let USE_COLLISION = true;

let spawnT = { x: 28.5, z: 45 };
let spawnCT = { x: -25.5, z: -57 };
let plants = [];
let FLOORS = [];

const round = new RoundManager({
    roundsToWin: 5,
    roundDuration: 60,
    betweenRounds: 3,
    onRoundStart: (n) => {
        showBanner(`Раунд ${n}`, '#FFD24A', 1.5);
        resetRound();
        audio.freezeEnd();
        setTimeout(() => {
            audio.roundStart();
            audio.startRoundMusic();
        }, 800);
    },
    onRoundEnd: (winner, reason, sT, sCT) => {
        audio.stopRoundMusic();
        audio.stopBombTick();
        const color = winner === 'T' ? '#FFD24A' : '#5CA8FF';
        const text = winner === 'T' ? 'Победа T!' : 'Победа CT!';
        showBanner(text, color, 2);
        updateScore(sT, sCT);
        if (winner === 'T') audio.winT();
        else audio.winCT();
    },
    onMatchEnd: (winner, sT, sCT) => {
        audio.stopRoundMusic();
        const text = winner === 'T' ? 'МАТЧ: T ПОБЕДА!' : 'МАТЧ: CT ПОБЕДА!';
        const color = winner === 'T' ? '#FFD24A' : '#5CA8FF';
        showBanner(text, color, 999);
        if (winner === 'T') audio.winT();
        else audio.winCT();
    }
});

function showBanner(text, color, duration) {
    bannerEl.textContent = text;
    bannerEl.style.color = color;
    bannerEl.style.display = 'block';
    if (duration < 900) {
        setTimeout(() => { bannerEl.style.display = 'none'; }, duration * 1000);
    }
}

function updateScore(sT, sCT) {
    scoreTEl.textContent = `T ${sT}`;
    scoreCTEl.textContent = `CT ${sCT}`;
}

async function initGame() {
    const { arena, colliders, data } = await createArena();
    scene.add(arena);
    collision = new CollisionSystem(colliders);
    combat = new CombatSystem(scene);

    FLOORS = data.floors || [];
    spawnT = data.spawns?.T || spawnT;
    spawnCT = data.spawns?.CT || spawnCT;
    plants = data.plants || [];

    console.log('[main] plants:', plants);

    player = new Player(scene, 'T', spawnT);
    window.player = player;

    createTeams();

    abilityBombEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        tryPlaceBomb();
    }, { passive: false });
    abilityBombEl.addEventListener('click', (e) => {
        e.stopPropagation();
        tryPlaceBomb();
    });

    abilityHammerEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        tryHammer();
    }, { passive: false });
    abilityHammerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        tryHammer();
    });

    camera.position.set(spawnT.x, 45, spawnT.z + 35);
    setTimeout(() => round.start(), 500);
    animate();
}

function createTeams() {
    for (const b of tBots) b.die();
    for (const b of ctBots) b.die();
    tBots = [];
    ctBots = [];

    for (let i = 0; i < 4; i++) {
        const off = [
            { x: -4, z: 3 }, { x: 4, z: 3 },
            { x: -6, z: -3 }, { x: 6, z: -3 }
        ][i];
        tBots.push(new Enemy(scene, 'T', { x: spawnT.x + off.x, z: spawnT.z + off.z }));
    }

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
    player.hp = player.maxHp;
    player.alive = true;
    player.mesh.position.set(spawnT.x, 0, spawnT.z);
    for (const b of tBots) b.die();
    for (const b of ctBots) b.die();
    tBots = [];
    ctBots = [];
    createTeams();
    round.roundTimer = round.roundDuration;
}

function tryPlaceBomb() {
    // Диагностика
    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;
    logBomb(`POS: ${px.toFixed(1)}, ${pz.toFixed(1)}\nAlive: ${player.alive}\nPlaying: ${round.isPlaying()}\nPlants: ${plants.length}`);

    if (!player.alive) {
        logBomb('Игрок мёртв');
        return;
    }
    if (!round.isPlaying()) {
        logBomb('Раунд не идёт');
        return;
    }

    audio.uiClick();

    let nearestPlant = null;
    let nearestDist = Infinity;
    for (const p of plants) {
        const d = Math.hypot(px - p.x, pz - p.z);
        if (d < nearestDist) {
            nearestDist = d;
            nearestPlant = p;
        }
    }

    if (!nearestPlant) {
        logBomb('Нет плэнтов');
        audio.uiError();
        return;
    }

    logBomb(`Ближайший плэнт: ${nearestPlant.id}\nДистанция: ${nearestDist.toFixed(1)}\nРадиус: 20`);

    if (nearestDist > 20) {
        audio.uiError();
        showBanner(`Далеко от ${nearestPlant.id}!`, '#FF6666', 1.5);
        return;
    }

    // Успешно!
    audio.bombPlaced();
    audio.startBombTick();
    showBanner(`💣 Бомба на ${nearestPlant.id}!`, '#FFD24A', 2);
    logBomb(`✓ Бомба на ${nearestPlant.id}!`);
}

function tryHammer() {
    if (!player.alive) return;
    audio.uiClick();
    showBanner('🔨 Удар!', '#FFFFFF', 0.5);
}

const cameraOffset = { y: 45, z: 35 };
function updateCamera() {
    if (!player) return;
    const t = player.mesh.position;
    camera.position.x += (t.x - camera.position.x) * 0.12;
    camera.position.z += (t.z + cameraOffset.z - camera.position.z) * 0.12;
    camera.position.y = cameraOffset.y;
    camera.lookAt(t.x, 0, t.z);
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!player) return;

    const collisionRef = USE_COLLISION ? collision : null;
    const playing = round.isPlaying();

    const prevPos = player.mesh.position.clone();
    if (playing) player.update(dt, joystick.direction, collisionRef);

    const moved = prevPos.distanceTo(player.mesh.position) > 0.05;
    if (moved && playing) audio.footstep();

    const allBots = [...tBots, ...ctBots];

    if (player.alive && playing) {
        const enemiesForPlayer = ctBots.filter(b => b.alive);
        const target = combat.findNearestTarget(player.mesh.position, enemiesForPlayer, player.attackRange);
        if (target && collision) {
            const fromPos = player.mesh.position;
            const toPos = target.mesh.position;
            if (collision.hasLineOfSight(fromPos, toPos)) {
                player.faceTarget(toPos);
                player.attackTimer -= dt;
                if (player.attackTimer <= 0) {
                    player.attackTimer = player.attackCooldown;
                    combat.shoot(fromPos, target, 'T');
                    audio.shoot();
                }
            }
        }
    }

    if (playing) {
        const hasLOS = collision ? (a, b) => collision.hasLineOfSight(a, b) : () => true;
        for (const bot of tBots) {
            if (!bot.alive) continue;
            const action = bot.update(dt, allBots, player.mesh.position, player.alive, collisionRef, hasLOS);
            if (action?.type === 'shoot') {
                const fakeTarget = { mesh: { position: action.from.clone().add(action.direction.clone().multiplyScalar(10)) } };
                combat.shoot(action.from.clone().sub(new THREE.Vector3(0, 1.2, 0)), fakeTarget, 'T');
                audio.shoot();
            }
        }
        for (const bot of ctBots) {
            if (!bot.alive) continue;
            const action = bot.update(dt, allBots, player.mesh.position, player.alive, collisionRef, hasLOS);
            if (action?.type === 'shoot') {
                const fakeTarget = { mesh: { position: action.from.clone().add(action.direction.clone().multiplyScalar(10)) } };
                combat.shoot(action.from.clone().sub(new THREE.Vector3(0, 1.2, 0)), fakeTarget, 'CT');
                audio.shoot();
            }
        }
    }

    combat.update(dt, [...ctBots, ...tBots], player);

    const aliveT = tBots.filter(b => b.alive).length + (player.alive ? 1 : 0);
    const aliveCT = ctBots.filter(b => b.alive).length;
    round.update(dt, aliveT, aliveCT);

    hpEl.textContent = `HP: ${Math.round(player.hp)}`;
    roundTimerEl.textContent = Math.ceil(round.roundTimer);
    roundInfoEl.textContent = `Раунд ${round.roundNumber} / ${round.roundsToWin}`;

    if (player.alive && playing) {
        const px = player.mesh.position.x;
        const pz = player.mesh.position.z;
        let nearPlant = false;
        let nearestDist = Infinity;
        for (const p of plants) {
            const d = Math.hypot(px - p.x, pz - p.z);
            if (d < nearestDist) nearestDist = d;
            if (d < 20) { nearPlant = true; break; }
        }
        abilityBombEl.classList.toggle('active', nearPlant);
        abilityBombEl.classList.toggle('inactive', !nearPlant);
    } else {
        abilityBombEl.classList.remove('active');
        abilityBombEl.classList.add('inactive');
    }

    updateCamera();
    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => {
    setTimeout(onResize, 100);
    setTimeout(onResize, 300);
    setTimeout(onResize, 600);
});

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => setTimeout(onResize, 50));
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') {
        USE_COLLISION = !USE_COLLISION;
    }
});

initGame();
