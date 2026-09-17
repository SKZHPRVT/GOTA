export class Joystick {
    constructor(el) {
        this.el = el;
        this.direction = { x: 0, y: 0 };
        this.active = false;
        this.center = { x: 0, y: 0 };
        this.maxDist = 50;

        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.start(e.touches[0]);
        }, { passive: false });
        el.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.move(e.touches[0]);
        }, { passive: false });
        el.addEventListener('touchend', () => this.end());

        el.addEventListener('mousedown', (e) => this.start(e));
        window.addEventListener('mousemove', (e) => this.move(e));
        window.addEventListener('mouseup', () => this.end());
    }

    start(t) {
        this.active = true;
        const rect = this.el.getBoundingClientRect();
        this.center = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
        };
    }

    move(t) {
        if (!this.active) return;
        const dx = t.clientX - this.center.x;
        const dy = t.clientY - this.center.y;
        const dist = Math.hypot(dx, dy) || 1;
        const k = Math.min(dist, this.maxDist) / this.maxDist;
        this.direction.x = (dx / dist) * k;
        this.direction.y = (dy / dist) * k;
    }

    end() {
        this.active = false;
        this.direction.x = 0;
        this.direction.y = 0;
    }
}
