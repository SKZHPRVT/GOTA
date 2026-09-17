import * as THREE from 'three';
import { createArena } from './map/arena.js';
import { Player } from './entities/player.js';
import { Joystick } from './ui/joystick.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xC2B280);
scene.fog = new THREE.Fog(0xC2B280, 25, 90);

const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 200
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Свет
const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff2cc, 1.0);
sun.position.set(20, 40, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
scene.add(sun);

// Карта
const arena = createArena();
scene.add(arena);

// Игрок
const player = new Player(scene, 'T');

// Джойстик
const joystick = new Joystick(document.getElementById('joystick'));

// Камера
camera.position.set(0, 20, 16);
camera.lookAt(0, 0, 0);

// Цикл
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    
    player.update(dt, joystick.direction);
    
    const target = player.mesh.position;
    camera.position.x += (target.x - camera.position.x) * 0.1;
    camera.position.z += (target.z + 16 - camera.position.z) * 0.1;
    camera.lookAt(target.x, 0, target.z);
    
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
