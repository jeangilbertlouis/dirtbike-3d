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

### Phase 5 — Terrain presets ✅ done
- `src/terrain/presets.ts` defines each terrain as data + functions: height, ground colour, rocks, tree count, dust colour/rate, and sky/light look. The GUI's **terrain** picker lists them.
- **Dirt track**: open rolling hills with whoops (the original terrain).
- **Forest trail**: steeper hills, bigger whoops, roots across the line, rocks bedded into it, steep close banks, conifers, darker loam/moss colouring, damp (less) dust, hazy green light. At default settings it's roughly twice as bumpy as the dirt track, with a wheel off the ground ~30% of the time.
- Terrain mesh rows are packed toward the riding line (0.2 m along the track) so small bumps under the tyres are resolved.
- Suspension can now droop 11 cm below sag before a wheel leaves the ground, which is closer to a real bike.

## Definition of done (Phase 1)
- `npm run dev` opens a page showing a recognizable dirt bike that can be orbited, zoomed, and recolored.
- 60 fps on a typical laptop; no console errors; works in Chrome, Firefox, Edge.

## Decisions
- **Self-riding, not player-controlled** — ride mode is an automatic demo over terrain. Keyboard/gamepad control would be a later phase built on the same ride physics.
- **No physics engine** — the ride model is a small hand-written spring-damper solver, which is enough for a single bike and keeps the bundle small.
- **Code-built model** — all geometry is procedural three.js; no Blender/`.glb` assets.

### Phase 6 — Motocross track and jump physics ✅ done
- **Motocross track** preset: a hand-built profile per 56 m lap — tabletop (1.3 m), double (1.1 m takeoff over a gap), five whoops — on a groomed track with raised edges, a watered racing line, alternating track-edge blocks, grass infield and distant trees. Presets can now suggest a speed (33 km/h here, sized so the lips throw the bike onto the landings).
- **Jump physics fix**: the rear was kicking up far more than the front (e.g. 0.86 m vs 0.30 m) and the bike nose-dived to −52° off the double, because once the front leaves the lip the still-compressed rear spring flips the tail up. Fixed with:
  - realistic bike + rider pitch inertia (radius of gyration ≈ 0.67 m),
  - asymmetric damping — rebound much stiffer than compression, like a real shock,
  - a simple rider model: in the air (and partly with one wheel down) body weight and throttle/brake steer pitch toward the slope of the ground below, so the bike lands matching the landing.
  - Result on the double: front 1.84 m / rear 1.88 m of air, pitch −5° to +28°, landing within ~5° of the slope.

### Phase 7 — Damped suspension with unsprung wheels ✅ done
- Each wheel now has its own mass (front 6.5 %, rear 8.5 % of bike + rider) and rides on a tyre spring (~11× the suspension spring). Previously the wheels snapped to the ground or to full extension instantly.
- The damper acts on stroke speed whether or not the tyre is touching, so in the air the forks extend at the rebound-damped rate (≈1 m/s) instead of in a single frame (≈11 m/s). It is digressive (blows off above 0.6 m/s compression / 0.8 m/s rebound), adds hydraulic bottoming in the last 4 cm, and is solved implicitly on the wheel so stiff settings stay stable. Topping out transfers the wheel's momentum into the chassis.
- **Suspension** folder in the GUI: compression and rebound damping, live. Defaults (12 / 10) tuned so the motocross track no longer bottoms out (was 53 frames per 40 s), peak hits drop from 10 g to 7.8 g, and the double still gives balanced front/rear air (1.9 m / 2.0 m, pitch −6° to +28°).
