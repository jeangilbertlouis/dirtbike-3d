# Dirtbike 3D — Implementation Plan

A 3D dirt bike rendered in the browser with **three.js**. By default it rides on its own over endless procedural terrain; a showroom mode shows it on a studio floor. The model is **built entirely in code** — no external 3D model files. Player-controlled riding is out of scope for now.

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| Rendering | three.js (r17x, npm) | Requested; mature, great docs |
| Build / dev server | Vite | Instant dev server, zero-config TS, static build output |
| Language | TypeScript | Safer refactors as the bike rig grows |
| UI tweaks | lil-gui | Live-tune colors, suspension, camera while developing |
| Hosting | Static build (`dist/`) → GitHub Pages / Netlify | No backend needed |

## Project structure

```
dirtbike-3d/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── public/                 # small procedural-friendly textures (optional)
└── src/
    ├── main.ts             # bootstrap: renderer, loop, resize
    ├── scene/
    │   ├── setupScene.ts   # renderer, camera, lights, environment
    │   └── ground.ts       # showroom floor + contact shadow
    ├── bike/
    │   ├── DirtBike.ts     # assembles parts into one Group, exposes rig
    │   ├── frame.ts        # frame tubes, swingarm
    │   ├── wheels.ts       # knobby tires, rims, spokes, hubs
    │   ├── forks.ts        # front forks, triple clamps, handlebars
    │   ├── engine.ts       # engine block, exhaust pipe, silencer
    │   ├── body.ts         # plastics: tank, seat, fenders, number plates
    │   └── materials.ts    # shared materials / color scheme
    ├── controls/
    │   └── orbit.ts        # showroom orbit camera
    └── ui/gui.ts
```

## The bike model

Built **procedurally from three.js primitives** (no external model needed), organized as a rig so parts can move:

- **Frame**: `TubeGeometry` along `CatmullRomCurve3` paths for the cradle frame and subframe.
- **Wheels**: `TorusGeometry` tire + instanced knobs (`InstancedMesh`) for the knobby tread; thin torus rim; spokes as instanced thin cylinders; hub cylinder. Front 21", rear 18" proportions.
- **Front end**: two fork tubes (upper/lower cylinders for travel), triple clamps, handlebar tube, grips, levers.
- **Rear end**: swingarm pivoting at the frame, shock absorber (cylinder + coil spring via `TubeGeometry` helix).
- **Engine**: boxed shapes with bevelled edges (`RoundedBoxGeometry` from three/examples), cylinder head fins, exhaust as a `TubeGeometry` header into a silencer.
- **Plastics**: `ExtrudeGeometry` from 2D `Shape`s for tank shrouds, fenders, side/number plates; seat as a rounded extrusion.
- **Materials**: `MeshStandardMaterial` / `MeshPhysicalMaterial` — glossy plastics (clearcoat), brushed metal, matte rubber. Original color scheme, configurable via GUI.

Rig hierarchy (pivots named so animation/physics can drive them):

```
DirtBike (Group)
├── chassis
│   ├── steeringPivot → forks → frontWheel
│   └── swingarmPivot → swingarm → rearWheel
```

**Code-built principles**
- Every part is a function returning a `THREE.Group`, parameterized by dimensions (wheel size, wheelbase, fork length) so proportions can be tweaked in one place (`bike/dimensions.ts`).
- Detail comes from geometry, not textures: bevels, instancing for repeated parts (knobs, spokes, fins), and material variety.
- Any textures (e.g. tire rubber roughness, number-plate graphics) are generated at runtime with `CanvasTexture` — no image assets required.

## Phases

### Phase 0 — Scaffold (small) ✅ done
- `npm create vite@latest` (vanilla-ts), add `three`, `@types/three`, `lil-gui`.
- Renderer with ACES tone mapping, sRGB output, shadows, resize handling.
- Spinning placeholder cube to confirm the pipeline works.

### Phase 1 — Showroom viewer ✅ done (also includes Phase 2's wheel spin, suspension and steering animation)
- Build the procedural dirt bike (all parts above).
- Studio lighting: HDRI environment (`RoomEnvironment` or a free HDRI) + directional key light with soft shadows.
- Ground plane with contact shadow.
- `OrbitControls` with damping, zoom limits, auto-rotate toggle.
- lil-gui panel: plastics color, wheel spin, auto-rotate, exploded-view toggle.

### Phase 2 — Animation & polish
- Wheels spin, fork compression / rear shock animation (idle "bounce" demo).
- Steering animation, engine idle vibration.
- Post-processing: SSAO or SMAA via `EffectComposer` (keep optional for performance).
- Loading screen, responsive UI, mobile touch orbit.

### Phase 3 — Ship (deploy ✅ done)
- `npm run build`, deploy `dist/` to GitHub Pages via a GitHub Action. ✅
- Performance pass: merge static geometry, instancing, cap pixel ratio at 2, check on a mid-range phone.

### Phase 4 — Ride mode ✅ done
The bike rides itself over rough terrain; the camera still orbits freely.
- **Terrain** (`src/terrain/Terrain.ts`): procedural height field from layered value noise that tiles every 56 m along the direction of travel, so the mesh can scroll forever without a seam. Rolling hills, whoops and fine chatter on the riding line, rising banks and scattered rocks beside it. Vertex-colored dirt plus a canvas-drawn grit texture.
- **Ride physics** (`DirtBike.stepRide`): the bike stays at the origin while the terrain slides under it. The chassis is a sprung mass with heave and pitch on two spring-damper wheels (~2 Hz), integrated at 240 Hz. Each wheel follows the ground profile under its full radius, tops out when the ground drops away (airtime) and hits a bump stop at full travel. Fork compression and swingarm angle are mapped back onto the rig, so the shock and forks visibly work.
- **Dust** (`src/terrain/dust.ts`): soft shader point sprites kicked up at tire contact points.
- **Mode switch** (`src/scene/modes.ts`): outdoor sky/fog/lighting vs. studio look; GUI controls for speed and terrain roughness; camera smoothly follows ride height.

## Definition of done (Phase 1)
- `npm run dev` opens a page showing a recognizable dirt bike that can be orbited, zoomed, and recolored.
- 60 fps on a typical laptop; no console errors; works in Chrome, Firefox, Edge.

## Decisions
- **Self-riding, not player-controlled** — ride mode is an automatic demo over terrain. Keyboard/gamepad control would be a later phase built on the same ride physics.
- **No physics engine** — the ride model is a small hand-written spring-damper solver, which is enough for a single bike and keeps the bundle small.
- **Code-built model** — all geometry is procedural three.js; no Blender/`.glb` assets.
