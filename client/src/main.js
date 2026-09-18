import * as THREE from 'three';
import { createArena } from './map/arena.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Bomb } from './entities/bomb.js';
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

// === UI ===
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

// Bomb HUD
const bombHudEl = document.getElementById('bomb-hud');
const bombTimerEl = document.getElementById('bomb-timer');
const bombStatusEl = document.getElementById('bomb-status');
const defuseBarEl = document.getElementById('defuse-bar');
const defuseBarFillEl = document.getElementById('defuse-bar-fill');

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

// === БОМБА ===
let currentBomb = null;      // активная бомба
let bombPlanted = false;     // бомба заложена
let bombExploded = false;    // бомба взорвана
let bombDefused = false;     // бомба разминирована

// === RoundManager ===
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
        audio.stopDisarm();
        const color = winner === 'T' ? '#FFD24A' : '#5CA8FF';
        let text = winner === 'T' ? 'Победа T!' : 'Победа CT!';
        if (reason === 'bomb_exploded') text = '💥 ВЗРЫВ! T WIN';
        if (reason === 'bomb_defused') text = '✅ РАЗМИНИРОВАНО! CT WIN';
        if (reason === 'time') text = '⏰ Время вышло! CT WIN';
        showBanner(text, color, 2);
        updateScore(sT, sCT);
        if (winner === 'T') audio.winT();
        else audio.winCT();
        hideBombHud();
    },
    onMatchEnd: (winner, sT, sCT) => {
        audio.stopRoundMusic();
        const text = winner === 'T' ? 'МАТЧ: T ПОБЕДА!' : 'МАТЧ: CT ПОБЕДА!';
        const color = winner === 'T' ? '#FFD24A' : '#5CA8FF';
        showBanner(text, color, 999);
        hideBombHud();
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

// === BOMB HUD ===
function showBombHud() {
    bombHudEl.classList.add('show');
    defuseBarEl.classList.remove('show');
}

function hideBombHud() {
    bombHudEl.classList.remove('show');
    defuseBarEl.classList.remove('show');
}

function updateBombHud() {
    if (!currentBomb) return;
    bombTimerEl.textContent = Math.ceil(currentBomb.timer);
    if (currentBomb.isDefusing) {
        bombStatusEl.textContent = '🔧 РАЗМИНИРОВАНИЕ...';
        bombStatusEl.style.color = '#00ff00';
        defuseBarEl.classList.add('show');
        const p = Math.min(100, (currentBomb.defuseProgress / currentBomb.defuseTime) * 100);
        defuseBarFillEl.style.width = p + '%';
    } else {
        bombStatusEl.textContent = '💣 Бомба заложена!';
        bombStatusEl.style.color = '#ff3030';
        defuseBarEl.classList.remove('show');
    }
}

// === INIT ===
async function initGame() {
    const { arena, colliders, data } = await createArena();
    scene.add(arena);
    collision = new CollisionSystem(colliders);
    combat = new CombatSystem(scene);

    FLOORS = data.floors || [];
    spawnT = data.spawns?.T || spawnT;
    spawnCT = data.spawns?.CT || spawnCT;
    plants = data.plants || [];

    player = new Player(scene, 'T', spawnT);
    window.player = player;

    createTeams();

    // Кнопка 💣 — ставит бомбу
    abilityBombEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        tryPlaceBomb();
    }, { passive: false });
    abilityBombEl.addEventListener('click', (e) => {
        e.stopPropagation();
        tryPlaceBomb();
    });

    // Кнопка 🔨 — разминирует бомбу (CT-логика) ИЛИ удар по башне (когда не CT)
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
    // Сброс бомбы
    if (currentBomb) {
        currentBomb.destroy();
        currentBomb = null;
    }
    bombPlanted = false;
    bombExploded = false;
    bombDefused = false;
    hideBombHud();

    // Сброс игрока
    player.hp = player.maxHp;
    player.alive = true;
    player.mesh.position.set(spawnT.x, 0, spawnT.z);

    // Сброс ботов
    for (const b of tBots) b.die();
    for (const b of ctBots) b.die();
    tBots = [];
    ctBots = [];
    createTeams();
    round.roundTimer = round.roundDuration;
}

// === BOMB PLACEMENT ===
function tryPlaceBomb() {
    if (!player.alive || !round.isPlaying()) return;
    if (bombPlanted) {
        showBanner('Бомба уже заложена!', '#FF6666', 1.5);
        return;
    }

    const px = player.mesh.position.x;
    const pz = player.mesh.position.z;

    let nearestPlant = null;
    let nearestDist = Infinity;
    for (const p of plants) {
        const d = Math.hypot(px - p.x, pz - p.z);
        if (d < nearestDist) {
            nearestDist = d;
            nearestPlant = p;
        }
    }

    if (!nearestPlant || nearestDist > 20) {
        audio.uiError();
        showBanner('Не на плэнте!', '#FF6666', 1.5);
        return;
    }

    // Ставим бомбу
    bombPlanted = true;
    const bombPos = new THREE.Vector3(nearestPlant.x, 0, nearestPlant.z);
    currentBomb = new Bomb(scene, bombPos, () => {
        // Взрыв
        bombExploded = true;
        audio.stopBombTick();
        audio.bombExplode();
        setTimeout(() => {
            round.endRound('T', 'bomb_exploded');
        }, 300);
    });
    currentBomb.onDefused = () => {
        bombDefused = true;
        audio.stopDisarm();
        audio.bombDefused();
        setTimeout(() => {
            round.endRound('CT', 'bomb_defused');
        }, 300);
    };

    audio.bombPlaced();
    audio.startBombTick();
    showBanner(`💣 Бомба на ${nearestPlant.id}!`, '#FFD24A', 2);
    showBombHud();
}

// === HAMMER / DEFUSE ===
function tryHammer() {
    if (!player.alive) return;
    audio.uiClick();

    // Если есть бомба и игрок рядом — это разминирование (упрощённо, за CT)
    // Но игрок — за T, так что это "удар"
    showBanner('🔨 Удар!', '#FFFFFF', 0.5);
}

// === CAMERA ===
const cameraOffset = { y: 45, z: 35 };
function updateCamera() {
    if (!player) return;
    const t = player.mesh.position;
    camera.position.x += (t.x - camera.position.x) * 0.12;
    camera.position.z += (t.z + cameraOffset.z - camera.position.z) * 0.12;
    camera.position.y = cameraOffset.y;
    camera.lookAt(t.x, 0, t.z);
}

// === MAIN LOOP ===
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!player) return;

    const collisionRef = USE_COLLISION ? collision : null;
    const playing = round.isPlaying();

    // Игрок
    const prevPos = player.mesh.position.clone();
    if (playing) player.update(dt, joystick.direction, collisionRef);

    const moved = prevPos.distanceTo(player.mesh.position) > 0.05;
    if (moved && playing) audio.footstep();

    // === БОМБА ===
    if (currentBomb && currentBomb.alive) {
        // Список всех игроков рядом с бомбой (для проверки, что CT не ушёл)
        const nearby = [];
        if (player.alive) nearby.push(player.mesh.position);

        currentBomb.update(dt, nearby);
        updateBombHud();
    }

    // === СТРЕЛЬБА ИГРОКА ===
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

    // === СТРЕЛЬБА БОТОВ ===
    if (playing) {
        const hasLOS = collision ? (a, b) => collision.hasLineOfSight(a, b) : () => true;
        for (const bot of tBots) {
            if (!bot.alive) continue;
            const action = bot.update(dt, allBots, player.mesh.position, player.alive, collisionRef, hasLOS);
            if (action?.type === 'shoot') {
                const fakeTarget = { mesh: { position: action.from.clone().add(action.direction.clone().multiplyScalar(10)) } };
                combat.shoot(action.from.clone().sub(new THREE.Vector3(0, 1.2, 0)), fakeTarget, 'T');
                const dist = player.mesh.position.distanceTo(bot.mesh.position);
                audio.shootSpatial(dist);
            }
        }
        for (const bot of ctBots) {
            if (!bot.alive) continue;
            const action = bot.update(dt, allBots, player.mesh.position, player.alive, collisionRef, hasLOS);
            if (action?.type === 'shoot') {
                const fakeTarget = { mesh: { position: action.from.clone().add(action.direction.clone().multiplyScalar(10)) } };
                combat.shoot(action.from.clone().sub(new THREE.Vector3(0, 1.2, 0)), fakeTarget, 'CT');
                const dist = player.mesh.position.distanceTo(bot.mesh.position);
                audio.shootSpatial(dist);
            }
        }
    }

    combat.update(dt, [...ctBots, ...tBots], player);

    // === ПРОВЕРКА КОНЦА РАУНДА ===
    const aliveT = tBots.filter(b => b.alive).length + (player.alive ? 1 : 0);
    const aliveCT = ctBots.filter(b => b.alive).length;

    // Если бомба заложена — раунд не кончается просто по убийству
    if (!bombPlanted) {
        round.update(dt, aliveT, aliveCT);
    } else {
        // Идёт бомба — только таймер раунда и бомбы
        if (round.isPlaying()) {
            round.roundTimer -= dt;
            if (round.roundTimer <= 0) {
                round.roundTimer = 0;
                round.endRound('CT', 'time');
            }
        } else {
            round.update(dt, aliveT, aliveCT);
        }
    }

    // === HUD ===
    hpEl.textContent = `HP: ${Math.round(player.hp)}`;
    roundTimerEl.textContent = Math.ceil(round.roundTimer);
    roundInfoEl.textContent = `Раунд ${round.roundNumber} / ${round.roundsToWin}`;

    // Кнопка 💣
    if (player.alive && playing && !bombPlanted) {
        const px = player.mesh.position.x;
        const pz = player.mesh.position.z;
        let nearPlant = false;
        for (const p of plants) {
            const d = Math.hypot(px - p.x, pz - p.z);
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

// === RESIZE ===
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
