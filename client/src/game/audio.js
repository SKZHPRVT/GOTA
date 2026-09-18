// ============ AUDIO MANAGER — CS-style sounds ============

const SOUNDS = {
    // Выстрелы
    shoot:          'sounds/ak47-1.mp3',           // выстрел игрока/врага

    // Движение
    footstep:       'sounds/shagi-cs-go-1.mp3',

    // Раунды
    freezeEnd:      'sounds/elite_deploy.mp3',     // конец фризтайма
    roundStart:     'sounds/com_go.mp3',           // начало раунда
    roundMusic:     'sounds/fon.mp3',              // фоновая музыка раунда
    winT:           'sounds/terwin.mp3',
    winCT:          'sounds/ctwin.mp3',

    // Бомба
    bombPlaced:     'sounds/bombpl.mp3',
    bombTick:       'sounds/534sive.mp3',          // 35 сек тика
    bombDefused:    'sounds/bombdef.mp3',
    c4Disarm:       'sounds/c4_disarm.mp3',        // процесс разминирования
    bombExplode:    'sounds/c4_explode1.mp3',

    // Гранаты
    grenadeThrow:   'sounds/ct_fireinhole.mp3',
    grenadeExplode: 'sounds/explode3.mp3',
    flashExplode:   'sounds/flashbang_explode1.mp3'
};

// Громкость по умолчанию
const DEFAULT_VOLUMES = {
    shoot:          0.18,
    footstep:       0.10,
    freezeEnd:      0.8,
    roundStart:     0.7,
    roundMusic:     0.25,   // фон тише
    winT:           0.8,
    winCT:          0.8,
    bombPlaced:     0.9,
    bombTick:       0.5,
    bombDefused:    0.8,
    c4Disarm:       0.7,
    bombExplode:    0.9,
    grenadeThrow:   0.5,
    grenadeExplode: 0.8,
    flashExplode:   0.8
};

const cache = {};

function loadSound(name, url) {
    return new Promise((resolve) => {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = url;

        audio.addEventListener('canplaythrough', () => {
            cache[name] = audio;
            resolve(true);
        }, { once: true });

        audio.addEventListener('error', () => {
            console.warn('[audio] missing:', name, 'at', url);
            resolve(false);
        }, { once: true });

        audio.load();
    });
}

export class AudioManager {
    constructor() {
        this.enabled = true;
        this.masterVolume = 0.7;
        this.loaded = {};
        this.lastFootstep = 0;
        this.footstepInterval = 0.55;   // каждые 0.4 сек — шаг

        // Длинные звуки — играем один раз, не клонируем
        this.longSounds = ['roundMusic', 'bombTick'];
        this.currentLong = {};

        // Кэш для шагов (чтобы не спамить)
        this.footstepPool = [];
    }

    unlock() {
        if (this._unlocked) return;
        this._unlocked = true;
        const first = Object.values(cache)[0];
        if (first) {
            const v = first.volume;
            first.volume = 0;
            first.play().then(() => {
                first.pause();
                first.currentTime = 0;
                first.volume = v;
            }).catch(() => {});
        }
    }

    async preloadAll() {
        console.log('[audio] preloading...');
        const promises = [];
        for (const [name, url] of Object.entries(SOUNDS)) {
            promises.push(
                loadSound(name, url).then((ok) => {
                    this.loaded[name] = ok;
                })
            );
        }
        await Promise.all(promises);
        const count = Object.values(this.loaded).filter(v => v).length;
        console.log('[audio] loaded', count, '/', Object.keys(SOUNDS).length);
    }

    play(name, opts = {}) {
        if (!this.enabled) return null;
        const base = cache[name];
        if (!base) return null;

        const volume = (opts.volume ?? DEFAULT_VOLUMES[name] ?? 0.5) * this.masterVolume;

        const sound = base.cloneNode();
        sound.volume = Math.min(1, Math.max(0, volume));
        if (opts.rate) sound.playbackRate = opts.rate;
        if (opts.loop) sound.loop = true;

        // Для длинных — останавливаем предыдущий
        if (this.longSounds.includes(name)) {
            if (this.currentLong[name]) {
                try { this.currentLong[name].pause(); } catch (e) {}
            }
            this.currentLong[name] = sound;
        }

        const p = sound.play();
        if (p && p.catch) p.catch(() => {});

        if (!opts.loop) {
            sound.addEventListener('ended', () => {
                sound.src = '';
                if (this.currentLong[name] === sound) {
                    this.currentLong[name] = null;
                }
            }, { once: true });
        }

        return sound;
    }

    stop(name) {
        if (this.currentLong[name]) {
            try { this.currentLong[name].pause(); } catch (e) {}
            this.currentLong[name] = null;
        }
    }

    stopAllLong() {
        for (const name of Object.keys(this.currentLong)) {
            this.stop(name);
        }
    }

    // === Специализированные методы ===

    shoot() {
        this.play('shoot', { rate: 0.95 + Math.random() * 0.1 });
    }

    footstep() {
        const now = performance.now() / 1000;
        if (now - this.lastFootstep < this.footstepInterval) return;
        this.lastFootstep = now;
        this.play('footstep', { rate: 0.9 + Math.random() * 0.2 });
    }

    // Раунд
    freezeEnd() { this.play('freezeEnd'); }
    roundStart() { this.play('roundStart'); }
    startRoundMusic() { this.play('roundMusic', { loop: true }); }
    stopRoundMusic() { this.stop('roundMusic'); }
    winT() { this.play('winT'); }
    winCT() { this.play('winCT'); }

    // Бомба
    bombPlaced() { this.play('bombPlaced'); }
    startBombTick() { this.play('bombTick', { loop: false }); } // 35 сек один раз
    stopBombTick() { this.stop('bombTick'); }
    bombDefused() { this.play('bombDefused'); }
    startDisarm() { this.play('c4Disarm', { loop: true }); }
    stopDisarm() { this.stop('c4Disarm'); }
    bombExplode() { this.play('bombExplode'); }

    // Гранаты
    grenadeThrow() { this.play('grenadeThrow'); }
    grenadeExplode() { this.play('grenadeExplode'); }
    flashExplode() { this.play('flashExplode'); }

    setMasterVolume(v) {
        this.masterVolume = Math.min(1, Math.max(0, v));
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) this.stopAllLong();
        return this.enabled;
    }
}
