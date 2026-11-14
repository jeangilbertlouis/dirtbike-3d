# Dirtbike 3D

A dirt bike built entirely in code with [three.js](https://threejs.org/). By default it rides itself over endless, rough procedural terrain, with working suspension and dust; switch to **Showroom** mode to see it on a studio floor. There are no 3D model files or image assets: every part is procedural geometry, and the number plates and dirt texture are drawn on canvases at runtime.

Live: https://jeangilbertlouis.github.io/dirtbike-3d/

## Run

```bash
npm install
npm run dev      # dev server with hot reload
npm run build    # type-check + production build into dist/
```

## Controls

- Drag to orbit, scroll or pinch to zoom.
- Settings panel (top right):
  - **Mode**: Ride terrain or Showroom.
  - **Motion**: speed, terrain roughness, showroom bounce, steering.
  - **Colors**, race number, auto-rotate, exploded view, reset camera.

## Code map

| Path | What it does |
|---|---|
| `src/bike/dimensions.ts` | All proportions (wheel sizes, rake, wheelbase, pivots) in one place |
| `src/bike/DirtBike.ts` | Assembles the rig; ride physics (sprung chassis on two wheels), wheel spin, steering, exploded view |
| `src/bike/wheels.ts` | Knobby tires, rims, laced spokes, brake discs, sprockets, calipers |
| `src/bike/forks.ts` | Front end: fork legs, clamps, handlebar, front wheel |
| `src/bike/swingarm.ts` | Swingarm, rear wheel, chain |
| `src/bike/frame.ts`, `engine.ts`, `shock.ts`, `body.ts` | Frame, engine/exhaust/radiators, rear shock, plastics and seat |
| `src/terrain/Terrain.ts` | Endless scrolling height-field terrain (tiles every 56 m) with rocks |
| `src/terrain/dust.ts` | Dust particles kicked up by the tires |
| `src/scene/` | Renderer, lighting, showroom floor, ride/showroom look switching |

See [PLAN.md](PLAN.md) for the roadmap.
