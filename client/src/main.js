import * as THREE from 'three';
import { createArena } from './map/arena.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Joystick } from './ui/joystick.js';
import { CombatSystem } from './game/combat.js';
import { CollisionSystem } from './game/collision.js';
import { RoundManager } from './game/round.js';

// === Telegram WebApp: ещё раз force-expand (страховка) ===
const tg = window.Telegram?.WebApp;
if (tg) {
    try {
        tg.ready();
        tg.expand();
        if (tg.requestFullscreen) tg.requestFullscreen();
        if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
        if (tg.lockOrientation) tg.lockOrientation('landscape');
    } catch (e) {}

    // При изменении viewport — обновляем высоту
    if (tg.onEvent) {
        tg.onEvent('viewportChanged', () => {
            const h = tg.viewportStableHeight || window.innerHeight;
            document.documentElement.style.height = h + 'px';
            document.body.style.height = h + 'px';
        });
    }
}

// === Кнопка "Развернуть" — если Telegram не развернул ===
const expandBtn = document.getElementById('expand-btn');
if (expandBtn) {
    const checkExpanded = () => {
        if (!tg) return;
        const isExpanded = tg.isExpanded;
        const h = tg.viewportHeight || window.innerHeight;
        const stableH = tg.viewportStableHeight || window.innerHeight;
        // Если окно меньше 80% от экрана — кнопка нужна
        if (!isExpanded || h < stableH * 0.9) {
            expandBtn.classList.add('show');
        } else {
            expandBtn.classList.remove('show');
        }
    };

    expandBtn.addEventListener('click', () => {
        if (tg) {
            tg.expand();
            if (tg.requestFullscreen) tg.requestFullscreen();
            try { tg.lockOrientation?.('landscape'); } catch (e) {}
        }
        setTimeout(checkExpanded, 200);
    });

    // Проверка каждые 1.5 сек в первые 5 сек
    let checks = 0;
    const checkInterval = setInterval(() => {
        checkExpanded();
        checks++;
        if (checks > 3) clearInterval(checkInterval);
    }, 1500);
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

// === Состояние ===
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

// === RoundManager ===
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
        setTimeout(() => { bannerEl.style.display = 'none'; }, duration * 1000);
    }
}

function updateScore(sT, sCT) {
    scoreTEl.textContent = `T ${sT}`;
    scoreCTEl.textContent = `CT ${sCT}`;
}

// === Init ===
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

    player = new Player(scene, 'T', spawnT);
    window.player = player;

    createTeams();

    abilityBombEl.addEventListener('touchstart', (e) => { e.preventDefault(); tryPlaceBomb(); });
    abilityBombEl.addEventListener('click', () => tryPlaceBomb());
    abilityHammerEl.addEventListener('touchstart', (e) => { e.preventDefault(); tryHammer(); });
    abilityHammerEl.addEventListener('click', () => tryHammer());

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
        tBots.push(new Enemy(scene, 'T', {
            x: spawnT.x + off.x,
            z: spawnT.z + off.z
        }));
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
        return;
    }

    console.log('[bomb] placed at', nearPlant.id);
    showBanner(`💣 Бомба на ${nearPlant.id}!`, '#FFD24A', 2);
}

function tryHammer() {
    if (!player.alive) return;
    console.log('[hammer] hit');
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
let debugTimer = 0;

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (!player) return;

    const collisionRef = USE_COLLISION ? collision : null;
    const playing = round.isPlaying();

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

    const allBots = [...tBots, ...ctBots];

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
