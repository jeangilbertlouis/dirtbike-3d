# Dirtbike 3D

A dirt bike built entirely in code with [three.js](https://threejs.org/) and shown in an interactive showroom. There are no 3D model files or image assets: every part is procedural geometry, and the number plates are drawn on a canvas at runtime.

## Run

```bash
npm install
npm run dev      # dev server with hot reload
npm run build    # type-check + production build into dist/
```

## Controls

- Drag to orbit, scroll or pinch to zoom.
- Settings panel (top right): colors, race number, auto-rotate, exploded view, wheel speed, suspension bounce, steering.

## Code map

| Path | What it does |
|---|---|
| `src/bike/dimensions.ts` | All proportions (wheel sizes, rake, wheelbase, pivots) in one place |
| `src/bike/DirtBike.ts` | Assembles the rig; animates wheels, suspension, steering, exploded view |
| `src/bike/wheels.ts` | Knobby tires, rims, laced spokes, brake discs, sprockets, calipers |
| `src/bike/forks.ts` | Front end: fork legs, clamps, handlebar, front wheel |
| `src/bike/swingarm.ts` | Swingarm, rear wheel, chain |
| `src/bike/frame.ts`, `engine.ts`, `shock.ts`, `body.ts` | Frame, engine/exhaust/radiators, rear shock, plastics and seat |
| `src/scene/` | Renderer, lighting, showroom floor |

See [PLAN.md](PLAN.md) for the roadmap.
