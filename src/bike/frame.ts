import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIM, headCenter } from './dimensions';
import type { Mats } from './materials';
import { extrude, mesh, rod, roundedPoly, tube, v3 } from './util';

/** Twin-spar main frame, cradle downtubes, subframe, pegs and mounts. */
export function createFrame(m: Mats): THREE.Group {
  const g = new THREE.Group();
  g.name = 'frame';

  // Head tube, aligned with the steering axis.
  const axis = v3(-Math.sin(DIM.rake), Math.cos(DIM.rake));
  const H = v3(headCenter.x, headCenter.y);
  g.add(
    rod(
      H.clone().addScaledVector(axis, -0.075),
      H.clone().addScaledVector(axis, 0.075),
      0.03,
      m.frame,
      24,
    ),
  );

  for (const s of [-1, 1]) {
    // Main spar: head tube → over the engine → down past the swingarm pivot.
    g.add(
      tube(
        [
          v3(0.34, 1.07, s * 0.03),
          v3(0.22, 0.99, s * 0.09),
          v3(0.02, 0.9, s * 0.12),
          v3(-0.12, 0.82, s * 0.12),
          v3(-0.18, 0.7, s * 0.115),
          v3(-0.19, 0.56, s * 0.11),
          v3(-0.16, 0.42, s * 0.1),
        ],
        0.024,
        m.frame,
        80,
      ),
    );
    // Downtube and engine cradle.
    g.add(
      tube(
        [
          v3(0.4, 0.95, s * 0.02),
          v3(0.36, 0.8, s * 0.03),
          v3(0.31, 0.6, s * 0.045),
          v3(0.26, 0.42, s * 0.055),
          v3(0.18, 0.335, s * 0.06),
          v3(0.0, 0.32, s * 0.065),
          v3(-0.12, 0.35, s * 0.075),
          v3(-0.17, 0.42, s * 0.1),
        ],
        0.019,
        m.frame,
        80,
      ),
    );
    // Subframe: top rail and lower strut.
    g.add(
      tube([v3(-0.12, 0.82, s * 0.12), v3(-0.4, 0.86, s * 0.1), v3(-0.7, 0.885, s * 0.075)], 0.012, m.frame, 32),
    );
    g.add(
      tube([v3(-0.19, 0.6, s * 0.112), v3(-0.4, 0.74, s * 0.095), v3(-0.66, 0.87, s * 0.077)], 0.011, m.frame, 32),
    );

    // Swingarm pivot plates.
    const plate = extrude(
      roundedPoly(
        [
          [-0.245, 0.42],
          [-0.11, 0.39],
          [-0.12, 0.62],
          [-0.24, 0.64],
        ],
        0.04,
      ),
      0.018,
      m.frame,
      0.003,
    );
    plate.position.z = s * 0.117;
    g.add(plate);

    // Footpeg: mount block + serrated peg.
    const mount = mesh(new RoundedBoxGeometry(0.05, 0.045, 0.04, 2, 0.008), m.forkLug);
    mount.position.set(-0.14, 0.4, s * 0.15);
    g.add(mount);
    const peg = mesh(new RoundedBoxGeometry(0.055, 0.022, 0.085, 2, 0.006), m.steel);
    peg.position.set(-0.14, 0.4, s * 0.21);
    g.add(peg);
    for (let k = 0; k < 4; k++) {
      const tooth = mesh(new THREE.BoxGeometry(0.004, 0.008, 0.08), m.steel);
      tooth.position.set(-0.16 + k * 0.013, 0.414, s * 0.21);
      g.add(tooth);
    }
  }

  // Cross members: shock mount and subframe rear.
  g.add(rod(v3(-0.13, 0.82, -0.12), v3(-0.13, 0.82, 0.12), 0.016, m.frame));
  g.add(rod(v3(-0.69, 0.884, -0.077), v3(-0.69, 0.884, 0.077), 0.01, m.frame));

  // Swingarm pivot bolt.
  const P = DIM.swingarmPivot;
  g.add(rod(v3(P.x, P.y, -0.14), v3(P.x, P.y, 0.14), 0.011, m.steel));
  for (const s of [-1, 1]) {
    g.add(rod(v3(P.x, P.y, s * 0.127), v3(P.x, P.y, s * 0.137), 0.018, m.steel, 6));
  }
  return g;
}
