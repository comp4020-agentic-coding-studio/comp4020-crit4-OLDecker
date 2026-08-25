import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// World-space units the pond's polar coordinates map onto. distance 0..1
// (from pond.ts) becomes a radius in these units.
export const WORLD_RADIUS = 4;

// Kenney Nature Kit models are exported tiny (pad footprints are ~0.15-0.3
// units) relative to WORLD_RADIUS — scale them up so they read as real
// objects in the scene instead of specks.
export const PAD_MODEL_SCALE = 4.5;
const RIM_ROCK_SCALE = 2;

// `new URL(..., import.meta.url)` (rather than a plain string path) is what
// makes Vite's bundler notice these references, copy the files into dist/,
// and rewrite the URL — a plain string in a data attribute or array literal
// is invisible to that asset pipeline and would 404 once built.
const RIM_ROCKS = [
  new URL("./assets/models/rock_largeA.glb", import.meta.url).href,
  new URL("./assets/models/rock_largeB.glb", import.meta.url).href,
];

export const PAD_MODEL_URLS: Record<string, string> = {
  lily_large: new URL("./assets/models/lily_large.glb", import.meta.url).href,
  lily_small: new URL("./assets/models/lily_small.glb", import.meta.url).href,
  mushroom_red: new URL("./assets/models/mushroom_red.glb", import.meta.url).href,
  mushroom_tan: new URL("./assets/models/mushroom_tan.glb", import.meta.url).href,
  flower_purpleA: new URL("./assets/models/flower_purpleA.glb", import.meta.url).href,
  rock_smallFlatA: new URL("./assets/models/rock_smallFlatA.glb", import.meta.url).href,
  stump_round: new URL("./assets/models/stump_round.glb", import.meta.url).href,
};

// Fixed rim positions (world XZ), just outside WORLD_RADIUS, plus a rotation
// per rock so a repeated model doesn't read as an obvious copy-paste.
const RIM_PLACEMENTS: { x: number; z: number; rotationY: number; model: string }[] = [
  { x: WORLD_RADIUS * 1.15, z: WORLD_RADIUS * 0.3, rotationY: 0.4, model: RIM_ROCKS[0] },
  { x: -WORLD_RADIUS * 1.1, z: -WORLD_RADIUS * 0.5, rotationY: 2.1, model: RIM_ROCKS[1] },
  { x: -WORLD_RADIUS * 0.4, z: WORLD_RADIUS * 1.2, rotationY: 3.6, model: RIM_ROCKS[0] },
];

const BLADE_COUNT = 4;
const BLADE_LENGTH = 1.1;
const BLADE_COLORS = [0xffb454, 0xf4e9d8];

// Built from primitives rather than loaded like the other pond models: the
// user chose procedural generation for this one (no CC0 windmill exists in
// the Kenney pack already used elsewhere, and this avoids a new
// third-party-asset trust step). The rotor is exposed via userData so the
// caller can spin it independently of the tower each frame.
export function createWindmillModel(): THREE.Object3D {
  const root = new THREE.Group();

  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.32, 1.6, 10),
    new THREE.MeshStandardMaterial({ color: 0xcaa872, roughness: 0.8 }),
  );
  tower.position.y = 0.8;
  root.add(tower);

  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf4e9d8, roughness: 0.5 }),
  );
  hub.position.y = 1.6;
  root.add(hub);

  const rotor = new THREE.Group();
  rotor.position.y = 1.6;
  for (let i = 0; i < BLADE_COUNT; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, BLADE_LENGTH, 0.03),
      new THREE.MeshStandardMaterial({
        color: BLADE_COLORS[i % BLADE_COLORS.length],
        roughness: 0.6,
      }),
    );
    blade.position.y = BLADE_LENGTH / 2;
    const pivot = new THREE.Group();
    pivot.rotation.z = (i * Math.PI * 2) / BLADE_COUNT;
    pivot.add(blade);
    rotor.add(pivot);
  }
  root.add(rotor);
  root.userData.rotor = rotor;

  return root;
}

export interface PondScene {
  scene: THREE.Scene;
  loadModel(url: string): Promise<THREE.Object3D>;
  render(): void;
  resize(): void;
  worldToScreenPercent(worldX: number, worldY: number, worldZ: number): { xPercent: number; yPercent: number };
  screenToWorld(clientX: number, clientY: number): { x: number; z: number } | null;
}

export async function createPondScene(container: HTMLElement): Promise<PondScene> {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 6, 9);
  camera.lookAt(0, 0, 0);
  // lookAt only sets rotation; matrixWorld/matrixWorldInverse (what project()
  // and the raycaster read) aren't recomputed until a render happens or this
  // is called explicitly. Without it, any worldToScreenPercent/screenToWorld
  // call made before the first render() uses a stale identity matrix and
  // produces wildly wrong screen positions.
  camera.updateMatrixWorld(true);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  container.prepend(canvas);

  // Matches the page's --pond-bg so the canvas's alpha-cleared area blends
  // seamlessly into the surrounding .pond container instead of showing a
  // seam between two near-black tones.
  scene.background = new THREE.Color(0x1b2436);

  scene.add(new THREE.AmbientLight(0xffffff, 1.05));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.35);
  sun.position.set(4, 8, 5);
  scene.add(sun);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(WORLD_RADIUS * 1.3, 48),
    new THREE.MeshStandardMaterial({ color: 0x2ea37d, roughness: 0.3, metalness: 0.08 }),
  );
  water.rotation.x = -Math.PI / 2;
  scene.add(water);

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const raycaster = new THREE.Raycaster();

  const gltfLoader = new GLTFLoader();
  const modelCache = new Map<string, THREE.Object3D>();
  async function loadModel(url: string): Promise<THREE.Object3D> {
    const cached = modelCache.get(url);
    if (cached) return cached.clone(true);
    const gltf = await gltfLoader.loadAsync(url);
    // Some Nature Kit models have inconsistent face winding, which leaves
    // most of the mesh back-face-culled (near-invisible) from this camera
    // angle. Rendering both sides is cheap at this poly count and avoids
    // depending on every asset's winding being correct.
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const material of materials) {
          material.side = THREE.DoubleSide;
        }
      }
    });
    modelCache.set(url, gltf.scene);
    return gltf.scene.clone(true);
  }

  await Promise.all(
    RIM_PLACEMENTS.map(async (rim) => {
      const rock = await loadModel(rim.model);
      rock.position.set(rim.x, 0, rim.z);
      rock.rotation.y = rim.rotationY;
      rock.scale.setScalar(RIM_ROCK_SCALE);
      scene.add(rock);
    }),
  );

  function resize(): void {
    const rect = container.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height || 1;
    camera.updateProjectionMatrix();
  }

  function render(): void {
    renderer.render(scene, camera);
  }

  const projected = new THREE.Vector3();
  function worldToScreenPercent(
    worldX: number,
    worldY: number,
    worldZ: number,
  ): { xPercent: number; yPercent: number } {
    projected.set(worldX, worldY, worldZ).project(camera);
    return {
      xPercent: (projected.x * 0.5 + 0.5) * 100,
      yPercent: (1 - (projected.y * 0.5 + 0.5)) * 100,
    };
  }

  const ndc = new THREE.Vector2();
  const worldHit = new THREE.Vector3();
  function screenToWorld(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = container.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(groundPlane, worldHit);
    if (!hit) return null;
    return { x: hit.x, z: hit.z };
  }

  resize();
  window.addEventListener("resize", resize);

  return { scene, loadModel, render, resize, worldToScreenPercent, screenToWorld };
}
