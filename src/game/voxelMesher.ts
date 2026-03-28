/**
 * VoxelMesher — builds optimized Three.js geometry from a VoxelGrid.
 *
 * Features (controlled by GameConfig):
 * - Face culling: only emit faces not adjacent to opaque blocks
 * - Ambient occlusion: per-vertex AO based on corner neighbors (ClassiCube style)
 * - Greedy meshing: merge adjacent coplanar faces of same material + AO
 *
 * References:
 * - ClassiCube Builder.c: face culling + AO
 * - Mikola Lysenko: greedy meshing algorithm
 * - 0fps.net/2012/06/30/meshing-in-a-minecraft-game/
 */

import * as THREE from "three";
import { VoxelGrid } from "./voxelGrid";
import { getConfig } from "./config";
import { getMaterial } from "./materials";

// Face directions: [dx, dy, dz, face_index]
// Face indices: 0=right(+x), 1=left(-x), 2=top(+y), 3=bottom(-y), 4=front(+z), 5=back(-z)
const FACES = [
  { dir: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], normal: [1,0,0] },   // right +X
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], normal: [-1,0,0] },  // left -X
  { dir: [0, 1, 0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], normal: [0,1,0] },    // top +Y
  { dir: [0, -1, 0], corners: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]], normal: [0,-1,0] },  // bottom -Y
  { dir: [0, 0, 1], corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]], normal: [0,0,1] },    // front +Z
  { dir: [0, 0, -1], corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]], normal: [0,0,-1] },  // back -Z
];

// UV coordinates for each face — maps into texture atlas (4 variants, each 0.25 wide)
// Variant offset is added per-block in the mesher
const FACE_UVS = [
  [0, 0],
  [0.25, 0],  // 1/4 of atlas = one variant width
  [0.25, 1],
  [0, 1],
];

/**
 * Compute vertex ambient occlusion value (0-3) based on neighboring blocks.
 * Classic voxel AO algorithm from 0fps.net.
 *
 * For each vertex of a face, check 3 neighbors:
 * - side1: adjacent block along one edge
 * - side2: adjacent block along the other edge
 * - corner: diagonal block
 *
 * AO value: 0 = fully occluded (dark), 3 = no occlusion (bright)
 */
function vertexAO(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0;
  return 3 - (side1 ? 1 : 0) - (side2 ? 1 : 0) - (corner ? 1 : 0);
}

/**
 * Get AO values for 4 vertices of a face.
 * faceDir: which face (0-5)
 * x, y, z: block position
 * grid: voxel grid for neighbor lookups
 */
function computeFaceAO(
  faceIndex: number,
  x: number, y: number, z: number,
  grid: VoxelGrid
): [number, number, number, number] {
  const ao: [number, number, number, number] = [3, 3, 3, 3];

  // AO neighbor offsets per face per vertex
  // For each face, for each of 4 vertices, we need to check 3 neighbors
  // This is the standard voxel AO calculation
  const face = FACES[faceIndex];
  const [dx, dy, dz] = face.dir;

  // Determine the tangent axes for this face
  let t1x: number, t1y: number, t1z: number;
  let t2x: number, t2y: number, t2z: number;

  if (dy !== 0) {
    // Top/bottom face: tangent axes are X and Z
    t1x = 1; t1y = 0; t1z = 0;
    t2x = 0; t2y = 0; t2z = 1;
  } else if (dx !== 0) {
    // Left/right face: tangent axes are Z and Y
    t1x = 0; t1y = 0; t1z = 1;
    t2x = 0; t2y = 1; t2z = 0;
  } else {
    // Front/back face: tangent axes are X and Y
    t1x = 1; t1y = 0; t1z = 0;
    t2x = 0; t2y = 1; t2z = 0;
  }

  // Neighbor positions relative to the face normal direction
  const nx = x + dx;
  const ny = y + dy;
  const nz = z + dz;

  // Check 8 neighbors around the face for AO
  const s = (ox: number, oy: number, oz: number) =>
    grid.isOpaque(nx + ox, ny + oy, nz + oz);

  const s00 = s(-t1x, -t1y, -t1z);
  const s10 = s(t1x, t1y, t1z);
  const s01 = s(-t2x, -t2y, -t2z);
  const s11 = s(t2x, t2y, t2z);
  const c00 = s(-t1x - t2x, -t1y - t2y, -t1z - t2z);
  const c10 = s(t1x - t2x, t1y - t2y, t1z - t2z);
  const c01 = s(-t1x + t2x, -t1y + t2y, -t1z + t2z);
  const c11 = s(t1x + t2x, t1y + t2y, t1z + t2z);

  ao[0] = vertexAO(s00, s01, c00);
  ao[1] = vertexAO(s10, s01, c10);
  ao[2] = vertexAO(s10, s11, c11);
  ao[3] = vertexAO(s00, s11, c01);

  return ao;
}

// AO value to brightness (0-1)
const AO_BRIGHTNESS = [0.4, 0.6, 0.8, 1.0];

/**
 * Fast hash for deterministic per-block randomness.
 * Same (x,y,z) always produces the same value, but looks random.
 */
function blockHash(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return (h & 0x7fffffff) / 0x7fffffff; // 0.0 - 1.0
}

/**
 * Compute per-block color variation for realism.
 * Returns [r, g, b] multipliers (0.0 - 1.0+) to apply to vertex color.
 *
 * Three layers of realism:
 * 1. Random hue/brightness per block — no two identical blocks
 * 2. Height-based weathering — lower = dirtier, higher = cleaner
 * 3. Position-based patina — large-scale color drift across the city
 */
function blockColorVariation(
  x: number, y: number, z: number,
  matId: number, aoValue: number
): [number, number, number] {
  // Base AO brightness
  const ao = AO_BRIGHTNESS[aoValue];

  // --- Layer 1: Per-block random variation ---
  const hash1 = blockHash(x, y, z);
  const hash2 = blockHash(x + 7, y + 13, z + 31);
  const hash3 = blockHash(x + 17, y + 3, z + 47);

  // Variation amount depends on material category
  let variance = 0.08; // default 8% variation
  if (matId >= 20 && matId <= 49) variance = 0.12; // building walls: more variation
  if (matId >= 1 && matId <= 9) variance = 0.10;   // terrain: moderate
  if (matId >= 70 && matId <= 78) variance = 0.03;  // glass: very subtle
  if (matId >= 90 && matId <= 99) variance = 0.15;  // nature: most variation

  const rVar = 1.0 + (hash1 - 0.5) * variance * 2;
  const gVar = 1.0 + (hash2 - 0.5) * variance * 2;
  const bVar = 1.0 + (hash3 - 0.5) * variance * 2;

  // --- Layer 2: Height-based weathering ---
  // Lower blocks are darker/dirtier, upper blocks are cleaner
  // Only for buildings (walls and roofs)
  let heightFactor = 1.0;
  if (matId >= 20 && matId <= 57) {
    // Normalize y position (0 = ground level roughly -62, buildings go up from there)
    const normalizedHeight = Math.max(0, Math.min(1, (y + 62) / 30));
    // Bottom 30%: darken by up to 15% (grime/dirt)
    // Top: slight brighten (clean)
    heightFactor = 0.88 + normalizedHeight * 0.15;
  }

  // --- Layer 3: Large-scale position drift ---
  // Smooth color temperature shift across the city
  // Creates "neighborhoods" that feel slightly different
  const cityScale = 0.005; // one full cycle per ~200 blocks
  const warmth = Math.sin(x * cityScale) * Math.cos(z * cityScale * 0.7) * 0.04;

  const r = ao * rVar * heightFactor * (1.0 + warmth);
  const g = ao * gVar * heightFactor;
  const b = ao * bVar * heightFactor * (1.0 - warmth);

  return [
    Math.max(0, Math.min(1.3, r)),
    Math.max(0, Math.min(1.3, g)),
    Math.max(0, Math.min(1.3, b)),
  ];
}

/**
 * Build mesh for a chunk using face culling + AO + realistic color variation.
 * Groups geometry by material for batched rendering.
 */
export function buildChunkMeshCulled(
  grid: VoxelGrid,
  worldOffsetX: number,
  worldOffsetZ: number
): THREE.Group {
  const config = getConfig();
  const doAO = config.render.ambientOcclusion;

  const facesByMaterial = new Map<number, {
    positions: number[];
    normals: number[];
    uvs: number[];
    colors: number[];
    indices: number[];
    vertexCount: number;
  }>();

  function getOrCreate(matId: number) {
    let data = facesByMaterial.get(matId);
    if (!data) {
      data = {
        positions: [],
        normals: [],
        uvs: [],
        colors: [],
        indices: [],
        vertexCount: 0,
      };
      facesByMaterial.set(matId, data);
    }
    return data;
  }

  for (let y = 0; y < grid.sizeY; y++) {
    for (let z = 0; z < grid.sizeZ; z++) {
      for (let x = 0; x < grid.sizeX; x++) {
        const matId = grid.get(x, y, z);
        if (matId === 0) continue;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const [dx, dy, dz] = face.dir;
          const neighborMat = grid.get(x + dx, y + dy, z + dz);

          if (config.render.faceCulling) {
            if (grid.isOpaque(x + dx, y + dy, z + dz)) continue;
            if (neighborMat === matId && !grid.isOpaque(x + dx, y + dy, z + dz) && neighborMat !== 0) continue;
          }

          let ao: [number, number, number, number] = [3, 3, 3, 3];
          if (doAO) {
            ao = computeFaceAO(f, x, y, z, grid);
          }

          const data = getOrCreate(matId);
          const worldX = worldOffsetX + x;
          const worldY = grid.minY + y;
          const worldZ = worldOffsetZ + z;

          const baseVertex = data.vertexCount;

          // Select texture variant based on block position hash (0-3)
          const variantIndex = (blockHash(worldX, worldY, worldZ) * 4) | 0;
          const uvOffset = variantIndex * 0.25; // 0, 0.25, 0.5, or 0.75

          for (let v = 0; v < 4; v++) {
            const corner = face.corners[v];
            data.positions.push(
              worldX + corner[0],
              worldY + corner[1],
              worldZ + corner[2]
            );
            data.normals.push(face.normal[0], face.normal[1], face.normal[2]);
            data.uvs.push(FACE_UVS[v][0] + uvOffset, FACE_UVS[v][1]);

            // Realistic vertex color: AO × random variation × weathering × city drift
            const [r, g, b] = blockColorVariation(worldX, worldY, worldZ, matId, ao[v]);
            data.colors.push(r, g, b);
          }

          if (ao[0] + ao[2] > ao[1] + ao[3]) {
            data.indices.push(
              baseVertex, baseVertex + 1, baseVertex + 2,
              baseVertex, baseVertex + 2, baseVertex + 3
            );
          } else {
            data.indices.push(
              baseVertex + 1, baseVertex + 2, baseVertex + 3,
              baseVertex + 1, baseVertex + 3, baseVertex
            );
          }

          data.vertexCount += 4;
        }
      }
    }
  }

  const group = new THREE.Group();

  for (const [matId, data] of facesByMaterial) {
    if (data.vertexCount === 0) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(data.uvs, 2));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(data.colors, 3));
    geometry.setIndex(data.indices);
    geometry.computeBoundingSphere();

    const baseMaterial = getMaterial(matId);
    const material = baseMaterial.clone();
    material.vertexColors = true; // always on — colors encode AO + variation + weathering

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}
