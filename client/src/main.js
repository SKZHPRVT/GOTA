import * as THREE from 'three';
import { createArena } from './map/arena.js';
import { Player } from './entities/player.js';
import { Joystick } from './ui/joystick.js';

// Telegram Web App API
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
    try { tg.lockOrientation && tg.lockOrientation('landscape'); } catch (e) {}
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xC2B280);
scene.fog = new THREE.Fog(0xC2B280, 30, 110);

const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 250
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Свет
const ambient = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff2cc, 1.1);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
scene.add(sun);

// Карта
const arena = createArena();
scene.add(arena);

// Игрок
const player = new Player(scene, 'T');

// Джойстик
const joystick = new Joystick(
    document.getElementById('joystick'),
    document.getElementById('joystick-knob')
);

// Кнопки способностей (заглушки)
document.getElementById('ability-1').addEventListener('touchstart', (e) => {
    e.preventDefault();
    console.log('Ability 1: bomb/plant');
});
document.getElementById('ability-2').addEventListener('touchstart', (e) => {
    e.preventDefault();
    console.log('Ability 2: melee');
});

// Камера — сзади-сверху
const cameraOffset = { x: 0, y: 18, z: 16 };
function updateCamera() {
    const t = player.mesh.position;
    const targetX = t.x + cameraOffset.x;
    const targetZ = t.z + cameraOffset.z;
    camera.position.x += (targetX - camera.position.x) * 0.15;
    camera.position.z += (targetZ - camera.position.z) * 0.15;
    camera.position.y = cameraOffset.y;
    camera.lookAt(t.x, 0, t.z);
}
camera.position.set(0, 18, 56);

// Цикл
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    player.update(dt, joystick.direction);
    updateCamera();

    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
