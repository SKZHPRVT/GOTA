import * as THREE from 'three';

export class Bomb {
    constructor(scene, position, onExplode) {
        this.scene = scene;
        this.position = position.clone();
        this.onExplode = onExplode;

        this.timer = 40;              // 40 секунд до взрыва
        this.defuseTime = 5;          // 5 секунд на разминирование
        this.defuseProgress = 0;      // текущий прогресс разминирования
        this.isDefusing = false;
        this.defused = false;
        this.exploded = false;
        this.alive = true;

        // === Визуал ===
        this.mesh = new THREE.Group();

        // Корпус бомбы — тёмная коробка
        const bodyGeo = new THREE.BoxGeometry(1.2, 0.6, 0.8);
        const bodyMat = new THREE.MeshToonMaterial({ color: 0x2a2a2a });
        this.body = new THREE.Mesh(bodyGeo, bodyMat);
        this.body.position.y = 0.3;
        this.body.castShadow = true;
        this.mesh.add(this.body);

        // Мигающий огонёк
        const lightGeo = new THREE.SphereGeometry(0.15, 8, 8);
        this.lightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.light = new THREE.Mesh(lightGeo, this.lightMat);
        this.light.position.set(0, 0.8, 0);
        this.mesh.add(this.light);

        // Второй огонёк — зелёный (при разминировании)
        const light2Geo = new THREE.SphereGeometry(0.12, 8, 8);
        this.light2Mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.light2 = new THREE.Mesh(light2Geo, this.light2Mat);
        this.light2.position.set(0.3, 0.8, 0);
        this.light2.visible = false;
        this.mesh.add(this.light2);

        // Полупрозрачная сфера — зона действия
        const rangeGeo = new THREE.RingGeometry(2.5, 3, 32);
        const rangeMat = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        this.range = new THREE.Mesh(rangeGeo, rangeMat);
        this.range.rotation.x = -Math.PI / 2;
        this.range.position.y = 0.05;
        this.mesh.add(this.range);

        this.mesh.position.copy(position);
        this.mesh.position.y = 0;
        scene.add(this.mesh);

        this.blinkTimer = 0;
    }

    // Обновление каждый кадр
    update(dt, playersNearby = []) {
        if (!this.alive) return;

        // Мигание огонька
        this.blinkTimer += dt;
        const blinkRate = this.timer < 10 ? 0.15 : (this.timer < 20 ? 0.3 : 0.5);
        if (this.blinkTimer > blinkRate) {
            this.blinkTimer = 0;
            this.lightMat.color.setHex(
                this.lightMat.color.getHex() === 0xff0000 ? 0x660000 : 0xff0000
            );
        }

        // Разминирование
        if (this.isDefusing) {
            this.defuseProgress += dt;
            this.light2.visible = true;

            // Прогресс мигает зелёным
            const progress = Math.min(1, this.defuseProgress / this.defuseTime);
            this.light2Mat.color.setRGB(
                0, 0.5 + progress * 0.5, 0
            );

            // Проверяем, что CT ещё рядом
            const anyNear = playersNearby.some(p => {
                const d = Math.hypot(p.x - this.position.x, p.z - this.position.z);
                return d < 4;
            });

            if (!anyNear) {
                // Прервали разминирование
                this.isDefusing = false;
                this.defuseProgress = 0;
                this.light2.visible = false;
            }

            if (this.defuseProgress >= this.defuseTime) {
                this.defused = true;
                this.alive = false;
                if (this.onDefused) this.onDefused();
            }
        } else {
            // Тик таймера
            this.timer -= dt;

            if (this.timer <= 0) {
                this.timer = 0;
                this.explode();
                return;
            }
        }
    }

    startDefuse() {
        if (this.defused || this.exploded) return;
        this.isDefusing = true;
    }

    stopDefuse() {
        this.isDefusing = false;
        this.defuseProgress = 0;
        this.light2.visible = false;
    }

    explode() {
        if (this.exploded) return;
        this.exploded = true;
        this.alive = false;
        if (this.onExplode) this.onExplode();
        this.destroy();
    }

    destroy() {
        this.scene.remove(this.mesh);
    }
}
