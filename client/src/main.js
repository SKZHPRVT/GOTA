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

// === Loading ===
const loadingScreenEl = document.getElementById('loading-screen');
const loadingBarFill = document.getElementById('loading-bar-fill');
const loadingTextEl = document.getElementById('loading-text');
const loadingPercentEl = document.getElementById('loading-percent');

function setLoadingProgress(percent, text) {
    loadingBarFill.style.width = percent + '%';
    loadingPercentEl.textContent = Math.round(percent) + '%';
    if (text) loadingTextEl.textContent = text;
}
function hideLoadingScreen() {
    loadingScreenEl.classList.add('hide');
    setTimeout(() => { loadingScreenEl.style.display = 'none'; }, 600);
}

// === Audio ===
const audio = new AudioManager();
document.addEventListener('touchstart', () => audio.unlock());
document.addEventListener('click', () => audio.unlock());

// === Scene ===
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
const hpEl = document.getElementById('hp-hud');
const bannerEl = document.getElementById('banner');
const abilityBombEl = document.getElementById('ability-1');
const abilityHammerEl = document.getElementById('ability-2');
const damageFlashEl = document.getElementById('damage-flash');
const spectateIndicatorEl = document.getElementById('spectate-indicator');

const deathModalEl = document.getElementById('death-modal');
const deathSpectateBtn = document.getElementById('death-spectate');
const deathTakeoverBtn = document.getElementById('death-takeover');

const bombHudEl = document.getElementById('bomb-hud');
const bombTimerEl = document.getElementById('bomb-timer');
const bombStatusEl = document.getElementById('bomb-status');
const defuseBarEl = document.getElementById('defuse-bar');
const defuseBarFillEl = document.getElementById('defuse-bar-fill');

// === State ===
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

let currentBomb = null;
let bombPlanted = false;
let bombExploded = false;
let bombDefused = false;

// Freeze
const FREEZE_TIME = 3.0;
let isFrozen = true;

// Смерть и наблюдение
let deathModalShown = false;    // модалка уже показана?
let spectateTarget = null;      // за кем наблюдаем
let occupiedBot = null;         // занятый бот (когда takeover)

// === Round ===
const round = new RoundManager({
    roundsToWin: 5,
    roundDuration: 60,
    betweenRounds: 3,
    onRoundStart: (n) => {
        showBanner(`Раунд ${n}`, '#FFD24A', 1.5);
        resetRound();
        audio.freezeEnd();
        isFrozen = true;
        deathModalShown = false;
        hideDeathModal();
        hideSpectateIndicator();

        setTimeout(() => {
            isFrozen = false;
            player.isFrozen = false;
            // T-боты идут на A/B
            const plantA = plants.find(p => p.id === 'A');
            const plantB = plants.find(p => p.id === 'B');
            const tA = tBots.filter(b => b.role === 'A');
            const tB = tBots.filter(b => b.role === 'B');
            tA.forEach((bot, i) => {
                if (plantA) bot.setGoal(plantA.x + (i - 0.5) * 8, plantA.z);
            });
            tB.forEach((bot, i) => {
                if (plantB) bot.setGoal(plantB.x + (i - 0.5) * 8, plantB.z);
            });
            tBots.forEach(b => b.unfreeze());
            ctBots.forEach(b => b.unfreeze());
            audio.roundStart();
            audio.startRoundMusic();
        }, FREEZE_TIME * 1000);
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
        hideDeathModal();
        hideSpectateIndicator();
    },
    onMatchEnd: (winner, sT, sCT) => {
        audio.stopRoundMusic();
        const text = winner === 'T' ? 'МАТЧ: T ПОБЕДА!' : 'МАТЧ: CT ПОБЕДА!';
        const color = winner === 'T' ? '#FFD24A' : '#5CA8FF';
        showBanner(text, color, 999);
        hideBombHud();
        hideDeathModal();
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
        bombStatusEl.textContent = '🔧 РАЗМИНИРОВАНИЕ';
        bombStatusEl.style.color = '#00ff00';
        defuseBarEl.classList.add('show');
        const p = Math.min(100, (currentBomb.defuseProgress / currentBomb.defuseTime) * 100);
        defuseBarFillEl.style.width = p + '%';
    } else {
        bombStatusEl.textContent = '💣 Заложена';
        bombStatusEl.style.color = '#ff3030';
        defuseBarEl.classList.remove('show');
    }
}

// === Death modal ===
function showDeathModal() {
    deathModalEl.classList.add('show');
}
function hideDeathModal() {
    deathModalEl.classList.remove('show');
}
function showSpectateIndicator() {
    spectateIndicatorEl.classList.add('show');
}
function hideSpectateIndicator() {
    spectateIndicatorEl.classList.remove('show');
}

deathSpectateBtn.addEventListener('click', () => {
    console.log('[death] spectate mode');
    hideDeathModal();
    spectateTarget = tBots.find(b => b.alive) || null;
    showSpectateIndicator();
});

deathTakeoverBtn.addEventListener('click', () => {
    console.log('[death] takeover mode');
    hideDeathModal();
    // Ищем живого T-бота, ближайшего к игроку
    let nearestBot = null;
    let nearestDist = Infinity;
    for (const b of tBots) {
        if (!b.alive) continue;
        const d = b.mesh.position.distanceTo(player.mesh.position);
        if (d < nearestDist) {
            nearestDist = d;
            nearestBot = b;
        }
    }
    if (nearestBot) {
        occupiedBot = nearestBot;
        spectateTarget = nearestBot;
        showSpectateIndicator();
        spectateIndicatorEl.textContent = '🔄 УПРАВЛЕНИЕ БОТОМ';
    } else {
        showBanner('Нет живых ботов!', '#FF6666', 2);
    }
});

// === INIT ===
async function initGame() {
    setLoadingProgress(0, 'Загрузка звуков...');

    await audio.preloadAll((done, total, name) => {
        const p = (done / total) * 70;
        setLoadingProgress(p, `Звук: ${name} (${done}/${total})`);
    });

    setLoadingProgress(70, 'Загрузка карты...');

    const { arena, colliders, data } = await createArena();

    setLoadingProgress(90, 'Создание сцены...');

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

    abilityBombEl.addEventListener('touchstart', (e) => { e.preventDefault(); tryPlaceBomb(); }, { passive: false });
    abilityBombEl.addEventListener('click', (e) => { e.stopPropagation(); tryPlaceBomb(); });
    abilityHammerEl.addEventListener('touchstart', (e) => { e.preventDefault(); tryHammer(); }, { passive: false });
    abilityHammerEl.addEventListener('click', (e) => { e.stopPropagation(); tryHammer(); });

    camera.position.set(spawnT.x, 40, spawnT.z + 35);

    setLoadingProgress(100, 'Готово!');

    setTimeout(() => {
        hideLoadingScreen();
        round.start();
        animate();
    }, 400);
}

function createTeams() {
    for (const b of tBots) b.die();
    for (const b of ctBots) b.die();
    tBots = [];
    ctBots = [];

    const tRoles = [
        { role: 'A', offset: { x: -15, z: -1 } },
        { role: 'A', offset: { x: -5,  z: 1 } },
        { role: 'B', offset: { x: 5,   z: -1 } },
        { role: 'B', offset: { x: 15,  z: 1 } }
    ];
    for (const r of tRoles) {
        tBots.push(new Enemy(scene, 'T', {
            x: spawnT.x + r.offset.x,
            z: spawnT.z + r.offset.z
        }, r.role));
    }

    const ctRoles = [
        { role: 'mid', pos: { x: 0,    z: -20 } },
        { role: 'A',   pos: { x: 60,   z: -60 } },
        { role: 'A',   pos: { x: 75,   z: -70 } },
        { role: 'B',   pos: { x: -50,  z: -50 } },
        { role: 'B',   pos: { x: -65,  z: -40 } }
    ];
    for (const r of ctRoles) {
        ctBots.push(new Enemy(scene, 'CT', r.pos, r.role));
    }
}

function resetRound() {
    if (currentBomb) {
        currentBomb.destroy();
        currentBomb = null;
    }
    bombPlanted = false;
    bombExploded = false;
    bombDefused = false;
    hideBombHud();
    hideDeathModal();
    hideSpectateIndicator();

    spectateTarget = null;
    occupiedBot = null;

    player.hp = player.maxHp;
    player.alive = true;
    player.isFrozen = true;
    player.isAiming = false;
    player.mesh.position.set(spawnT.x, 0, spawnT.z);
    player.mesh.rotation.y = 0;

    for (const b of tBots) b.die();
    for (const b of ctBots) b.die();
    tBots = [];
    ctBots = [];
    createTeams();
    round.roundTimer = round.roundDuration;
}

function tryPlaceBomb() {
    if (!player.alive || !round.isPlaying()) return;
    if (bombPlanted) {
        showBanner('Бомба уже заложена!', '#FF6666', 1.5);
        return;
    }
    if (isFrozen) {
        showBanner('Фризтайм!', '#FF6666', 1);
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
        showBanner('Не на плэнте!', '#FF6666', 1.5);
        return;
    }

    bombPlanted = true;
    const bombPos = new THREE.Vector3(nearestPlant.x, 0, nearestPlant.z);
    currentBomb = new Bomb(scene, bombPos, () => {
        bombExploded = true;
        audio.stopBombTick();
        audio.bombExplode();
        setTimeout(() => round.endRound('T', 'bomb_exploded'), 300);
    });
    currentBomb.onDefused = () => {
        bombDefused = true;
        audio.stopDisarm();
        audio.bombDefused();
        setTimeout(() => round.endRound('CT', 'bomb_defused'), 300);
    };

    audio.bombPlaced();
    audio.startBombTick();
    showBanner(`💣 Бомба на ${nearestPlant.id}!`, '#FFD24A', 2);
    showBombHud();

    tBots.forEach(b => { if (b.alive) b.setGoal(nearestPlant.x, nearestPlant.z); });
    ctBots.forEach(b => { if (b.alive) b.setGoal(nearestPlant.x, nearestPlant.z); });
}

function tryHammer() {
    if (!player.alive) return;
    showBanner('🔨 Удар!', '#FFFFFF', 0.5);
}

// === Camera ===
const cameraOffset = { y: 40, z: 35 };

function updateCamera() {
    // Следим за: игроком → занятым ботом → spectate target
    let target = null;
    if (player.alive) {
        target = player.mesh.position;
    } else if (occupiedBot && occupiedBot.alive) {
        target = occupiedBot.mesh.position;
    } else if (spectateTarget && spectateTarget.alive) {
        target = spectateTarget.mesh.position;
    } else {
        // Найти любого живого T-бота
        const anyT = tBots.find(b => b.alive);
        if (anyT) target = anyT.mesh.position;
    }

    if (!target) return;

    camera.position.x += (target.x - camera.position.x) * 0.12;
    camera.position.z += (target.z + cameraOffset.z - camera.position.z) * 0.12;
    camera.position.y = cameraOffset.y;
    camera.lookAt(target.x, 0, target.z);
}

// === Damage flash ===
let damageFlashTimer = null;
function flashDamage() {
    damageFlashEl.classList.add('flash');
    clearTimeout(damageFlashTimer);
    damageFlashTimer = setTimeout(() => {
        damageFlashEl.classList.remove('flash');
    }, 120);
}

// === Main loop ===
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!player) return;

    const collisionRef = USE_COLLISION ? collision : null;
    const playing = round.isPlaying();

    const prevPos = player.mesh.position.clone();
    const prevHp = player.hp;

    // Игрок
    if (player.alive && playing && !isFrozen) {
        player.update(dt, joystick.direction, collisionRef);
        // Если игрок не стреляет — снимаем aiming (через 0.2 сек)
        if (player.isAiming) {
            player.aimTimer = (player.aimTimer || 0) - dt;
            if (player.aimTimer <= 0) {
                player.stopAiming();
            }
        }
    } else if (player.alive && playing && isFrozen) {
        player.update(dt, { x: 0, y: 0 }, collisionRef);
    }

    // Занятый бот — управляем им через джойстик
    if (occupiedBot && occupiedBot.alive && playing) {
        occupiedBot.isFrozen = false;
            player.isFrozen = false;
        if (joystick.direction.x || joystick.direction.y) {
            const moveDir = new THREE.Vector3(joystick.direction.x, 0, joystick.direction.y);
            if (moveDir.length() > 0.15) {
                moveDir.normalize().multiplyScalar(occupiedBot.speed * dt);
                if (collisionRef) {
                    const cur = occupiedBot.mesh.position;
                    const res = collisionRef.resolveMove(cur.x, cur.z, moveDir.x, moveDir.z);
                    occupiedBot.mesh.position.x = res.x;
                    occupiedBot.mesh.position.z = res.z;
                } else {
                    occupiedBot.mesh.position.add(moveDir);
                }
                const angle = Math.atan2(moveDir.x, moveDir.z);
                occupiedBot.mesh.rotation.y = angle + Math.PI;

                // Анимация
                occupiedBot.animTime += dt * 10;
                const swing = Math.sin(occupiedBot.animTime) * 0.5;
                occupiedBot.legL.rotation.x = swing;
                occupiedBot.legR.rotation.x = -swing;
                occupiedBot.armL.rotation.x = -swing * 0.7;
                occupiedBot.armR.rotation.x = swing * 0.7;
            }
        }
    }

    // HP изменился
    if (player.hp < prevHp) flashDamage();

    // Игрок умер — показать модалку
    if (!player.alive && !deathModalShown && playing) {
        deathModalShown = true;
        audio.death();
        setTimeout(() => {
            if (playing) showDeathModal();
        }, 500);
    }

    // Footsteps
    const moved = prevPos.distanceTo(player.mesh.position) > 0.05;
    if (moved && playing && player.alive) audio.footstep();

    // Bomb
    if (currentBomb && currentBomb.alive) {
        const nearby = [];
        if (player.alive) nearby.push(player.mesh.position);
        if (occupiedBot && occupiedBot.alive) nearby.push(occupiedBot.mesh.position);
        currentBomb.update(dt, nearby);
        updateBombHud();
    }

    const allBots = [...tBots, ...ctBots];

    // Игрок стреляет
    if (player.alive && playing && !isFrozen) {
        const enemiesForPlayer = ctBots.filter(b => b.alive);
        const target = combat.findNearestTarget(player.mesh.position, enemiesForPlayer, player.attackRange);
        if (target && collision) {
            const fromPos = player.mesh.position;
            const toPos = target.mesh.position;
            if (collision.hasLineOfSight(fromPos, toPos)) {
                player.faceTarget(toPos);
                player.aimTimer = 0.2;
                player.attackTimer -= dt;
                if (player.attackTimer <= 0) {
                    player.attackTimer = player.attackCooldown;
                    combat.shoot(fromPos, target, 'T');
                    audio.shoot();
                }
            }
        }
    }

    // Боты
    if (playing) {
        const hasLOS = collision ? (a, b) => collision.hasLineOfSight(a, b) : () => true;
        for (const bot of tBots) {
            if (!bot.alive) continue;
            const action = bot.update(dt, allBots, player.mesh.position, player.alive, collisionRef, hasLOS);
            if (action?.type === 'shoot') {
                const fakeTarget = { mesh: { position: action.from.clone().add(action.direction.clone().multiplyScalar(10)) } };
                combat.shoot(action.from.clone().sub(new THREE.Vector3(0, 1.6, 0)), fakeTarget, 'T');
                const dist = player.mesh.position.distanceTo(bot.mesh.position);
                audio.shootSpatial(dist);
            }
        }
        for (const bot of ctBots) {
            if (!bot.alive) continue;
            const action = bot.update(dt, allBots, player.mesh.position, player.alive, collisionRef, hasLOS);
            if (action?.type === 'shoot') {
                const fakeTarget = { mesh: { position: action.from.clone().add(action.direction.clone().multiplyScalar(10)) } };
                combat.shoot(action.from.clone().sub(new THREE.Vector3(0, 1.6, 0)), fakeTarget, 'CT');
                const dist = player.mesh.position.distanceTo(bot.mesh.position);
                audio.shootSpatial(dist);
            }
        }
    }

    // Bullets + damage
    combat.update(dt, [...ctBots, ...tBots], player, () => flashDamage());

    // Round end check
    const aliveT = tBots.filter(b => b.alive).length + (player.alive ? 1 : 0);
    const aliveCT = ctBots.filter(b => b.alive).length;

    if (!bombPlanted) {
        round.update(dt, aliveT, aliveCT);
    } else {
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

    hpEl.textContent = `HP: ${Math.round(player.hp)}`;
    roundTimerEl.textContent = Math.ceil(round.roundTimer);

    if (player.alive && playing && !bombPlanted && !isFrozen) {
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

initGame();
