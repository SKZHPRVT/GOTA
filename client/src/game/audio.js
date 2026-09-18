// ============ AUDIO MANAGER v3 — spatial sound ============

const SOUNDS = {
    shoot:          'sounds/ak47-1.mp3',
    footstep:       'sounds/shagi-cs-go-1.mp3',
    freezeEnd:      'sounds/elite_deploy.mp3',
    roundStart:     'sounds/com_go.mp3',
    roundMusic:     'sounds/fon.mp3',
    winT:           'sounds/terwin.mp3',
    winCT:          'sounds/ctwin.mp3',
    bombPlaced:     'sounds/bombpl.mp3',
    bombTick:       'sounds/534sive.mp3',
    bombDefused:    'sounds/bombdef.mp3',
    c4Disarm:       'sounds/c4_disarm.mp3',
    bombExplode:    'sounds/c4_explode1.mp3',
    grenadeThrow:   'sounds/ct_fireinhole.mp3',
    grenadeExplode: 'sounds/explode3.mp3',
    flashExplode:   'sounds/flashbang_explode1.mp3'
};

const DEFAULT_VOLUMES = {
    shoot:          0.14,   // было 0.18 → -22%
    footstep:       0.08,   // было 0.10
    freezeEnd:      0.70,
    roundStart:     0.65,
    roundMusic:     0.15,   // было 0.20 → -25%
    winT:           0.75,
    winCT:          0.75,
    bombPlaced:     1.00,   // было 0.85 → громче
    bombTick:       0.90,   // было 0.4 → сильно громче
    bombDefused:    0.75,
    c4Disarm:       0.70,
    bombExplode:    0.85,
    grenadeThrow:   0.45,
    grenadeExplode: 0.75,
    flashExplode:   0.75
};

const MAX_CONCURRENT = {
    shoot:          3,
    footstep:       1,
    freezeEnd:      1,
    roundStart:     1,
    roundMusic:     1,
    winT:           1,
    winCT:          1,
    bombPlaced:     1,
    bombTick:       1,
    bombDefused:    1,
    c4Disarm:       1,
    bombExplode:    1,
    grenadeThrow:   2,
    grenadeExplode: 2,
    flashExplode:   1
};

const MIN_INTERVAL = {
    shoot:    0.08,
    footstep: 0.55,
    default:  0
};

const SPATIAL = {
    maxDistance: 60,
    fullVolume:  30,
    minVolume:   0.15
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
        this.masterVolume = 0.65;
        this.loaded = {};

        this.activeCount = {};
        this.lastPlay = {};

        this.longSounds = ['roundMusic', 'bombTick', 'c4Disarm'];
        this.currentLong = {};
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
        for (const [name, ok] of Object.entries(this.loaded)) {
            if (!ok) console.warn('[audio] NOT LOADED:', name);
        }
    }

    canPlay(name) {
        const now = performance.now() / 1000;

        const interval = MIN_INTERVAL[name] ?? MIN_INTERVAL.default;
        if (interval > 0) {
            const last = this.lastPlay[name] || 0;
            if (now - last < interval) return false;
        }

        const max = MAX_CONCURRENT[name] || 2;
        const active = this.activeCount[name] || 0;
        if (active >= max) return false;

        return true;
    }

    play(name, opts = {}) {
        if (!this.enabled) return null;
        const base = cache[name];
        if (!base) return null;

        if (!opts.force && !this.canPlay(name)) {
            return null;
        }

        const volume = (opts.volume ?? DEFAULT_VOLUMES[name] ?? 0.5) * this.masterVolume;

        if (volume < 0.005) return null;

        if (this.longSounds.includes(name)) {
            if (!this.currentLong[name]) {
                this.currentLong[name] = base.cloneNode();
            }
            const sound = this.currentLong[name];
            sound.volume = Math.min(1, Math.max(0, volume));
            sound.loop = !!opts.loop;

            const p = sound.play();
            if (p && p.catch) p.catch(() => {});
            this.lastPlay[name] = performance.now() / 1000;
            return sound;
        }

        const sound = base.cloneNode();
        sound.volume = Math.min(1, Math.max(0, volume));
        if (opts.rate) sound.playbackRate = opts.rate;

        this.activeCount[name] = (this.activeCount[name] || 0) + 1;
        this.lastPlay[name] = performance.now() / 1000;

        const cleanup = () => {
            this.activeCount[name] = Math.max(0, (this.activeCount[name] || 1) - 1);
            sound.removeEventListener('ended', cleanup);
            sound.removeEventListener('error', cleanup);
            sound.src = '';
        };
        sound.addEventListener('ended', cleanup, { once: true });
        sound.addEventListener('error', cleanup, { once: true });

        const p = sound.play();
        if (p && p.catch) p.catch(() => {});

        return sound;
    }

    stop(name) {
        if (this.currentLong[name]) {
            try {
                this.currentLong[name].pause();
                this.currentLong[name].currentTime = 0;
            } catch (e) {}
        }
    }

    stopAllLong() {
        for (const name of this.longSounds) {
            this.stop(name);
        }
    }

    shootSpatial(distance) {
        if (distance > SPATIAL.maxDistance) return;

        let volMul;
        if (distance <= SPATIAL.fullVolume) {
            volMul = 1.0;
        } else {
            const t = (distance - SPATIAL.fullVolume) / (SPATIAL.maxDistance - SPATIAL.fullVolume);
            volMul = 1.0 - t * (1.0 - SPATIAL.minVolume);
        }

        const volume = DEFAULT_VOLUMES.shoot * volMul;

        this.play('shoot', {
            rate: 0.95 + Math.random() * 0.1,
            volume: volume
        });
    }

    shoot() {
        this.play('shoot', { rate: 0.95 + Math.random() * 0.1 });
    }

    footstep() {
        this.play('footstep', { rate: 0.9 + Math.random() * 0.2 });
    }

    freezeEnd() { this.play('freezeEnd'); }
    roundStart() { this.play('roundStart'); }

    startRoundMusic() {
        this.play('roundMusic', { loop: true, force: true });
    }
    stopRoundMusic() { this.stop('roundMusic'); }

    winT() { this.play('winT'); }
    winCT() { this.play('winCT'); }

    bombPlaced() { this.play('bombPlaced'); }

    startBombTick() {
        this.play('bombTick', { loop: false, force: true });
    }
    stopBombTick() { this.stop('bombTick'); }

    bombDefused() { this.play('bombDefused'); }

    startDisarm() {
        this.play('c4Disarm', { loop: true, force: true });
    }
    stopDisarm() { this.stop('c4Disarm'); }

    bombExplode() { this.play('bombExplode'); }

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
