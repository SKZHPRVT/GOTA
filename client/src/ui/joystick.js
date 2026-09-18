export class Joystick {
    constructor(el, knob) {
        this.el = el;
        this.knob = knob;
        this.direction = { x: 0, y: 0 };
        this.active = false;
        this.center = { x: 0, y: 0 };
        this.maxDist = 55;

        const onStart = (t) => {
            this.active = true;
            const rect = this.el.getBoundingClientRect();
            this.center = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            this.onMove(t);
        };

        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            onStart(e.touches[0]);
        }, { passive: false });
        el.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.active) this.onMove(e.touches[0]);
        }, { passive: false });
        el.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.onEnd();
        }, { passive: false });
        el.addEventListener('touchcancel', () => this.onEnd());

        el.addEventListener('mousedown', (e) => onStart(e));
        window.addEventListener('mousemove', (e) => {
            if (this.active) this.onMove(e);
        });
        window.addEventListener('mouseup', () => this.onEnd());
    }

    onMove(t) {
        const dx = t.clientX - this.center.x;
        const dy = t.clientY - this.center.y;
        const dist = Math.hypot(dx, dy) || 1;
        const k = Math.min(dist, this.maxDist) / this.maxDist;

        this.direction.x = (dx / dist) * k;
        this.direction.y = (dy / dist) * k;

        if (this.knob) {
            this.knob.style.transform =
                `translate(calc(-50% + ${dx * k * 0.6}px), calc(-50% + ${dy * k * 0.6}px))`;
        }
    }

    onEnd() {
        this.active = false;
        this.direction.x = 0;
        this.direction.y = 0;
        if (this.knob) {
            this.knob.style.transform = 'translate(-50%, -50%)';
        }
    }
}
