/**
 * Greedy Mesher — merges adjacent coplanar faces of the same material into larger quads.
 *
 * Based on Mikola Lysenko's algorithm:
 * https://0fps.net/2012/06/30/meshing-in-a-minecraft-game/
 * https://github.com/mikolalysenko/mikolalysenko.github.com/blob/gh-pages/MinecraftMeshes/js/greedy.js
 *
 * For each of 3 axes, sweeps slice-by-slice, builds a 2D mask of face material IDs,
 * then greedily expands rectangles of same material + same AO.
 */

import * as THREE from "three";
import { VoxelGrid } from "./voxelGrid";
import { getConfig } from "./config";
import { getMaterial } from "./materials";

// AO brightness table
const AO_BRIGHTNESS = [0.4, 0.6, 0.8, 1.0];

function vertexAO(side1: boolean, side2: boolean, corner: boolean): number {
  if (side1 && side2) return 0;
  return 3 - (side1 ? 1 : 0) - (side2 ? 1 : 0) - (corner ? 1 : 0);
}

/** Encode material + AO into a single mask value for greedy comparison */
function encodeMask(matId: number, ao0: number, ao1: number, ao2: number, ao3: number): number {
  // Pack: matId (16 bits) + ao values (2 bits each = 8 bits) = 24 bits, fits in i32
  return (matId << 8) | (ao0 << 6) | (ao1 << 4) | (ao2 << 2) | ao3;
}

function decodeMat(encoded: number): number {
  return encoded >> 8;
}

function decodeAO(encoded: number): [number, number, number, number] {
  return [
    (encoded >> 6) & 3,
    (encoded >> 4) & 3,
    (encoded >> 2) & 3,
    encoded & 3,
  ];
}

interface FaceData {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
  vertexCount: number;
}

/**
 * Build greedy-meshed geometry for a chunk.
 * Sweeps 3 axes, merges same-material + same-AO faces into larger quads.
 */
export function buildChunkMeshGreedy(
  grid: VoxelGrid,
  worldOffsetX: number,
  worldOffsetZ: number
): THREE.Group {
  const config = getConfig();
  const doAO = config.render.ambientOcclusion;
  const dims = [grid.sizeX, grid.sizeY, grid.sizeZ];

  const facesByMaterial = new Map<number, FaceData>();

  function getOrCreate(matId: number): FaceData {
    let data = facesByMaterial.get(matId);
    if (!data) {
      data = { positions: [], normals: [], uvs: [], colors: [], indices: [], vertexCount: 0 };
      facesByMaterial.set(matId, data);
    }
    return data;
  }

  // Helper to read from grid with world-relative coords
  function getBlock(x: number, y: number, z: number): number {
    return grid.get(x, y, z);
  }

  function isOpaque(x: number, y: number, z: number): boolean {
    return grid.isOpaque(x, y, z);
  }

  // Compute AO for a face at position, given face normal direction
  function computeAO(
    x: number, y: number, z: number,
    d: number, backface: boolean
  ): [number, number, number, number] {
    if (!doAO) return [3, 3, 3, 3];

    const u = (d + 1) % 3;
    const v = (d + 2) % 3;

    // Normal direction offset
    const nd = backface ? -1 : 0;
    const pos = [x, y, z];
    pos[d] += backface ? 0 : 1;

    const nx = pos[0], ny = pos[1], nz = pos[2];

    // Sample neighbors in the tangent plane
    function solid(du: number, dv: number): boolean {
      const p = [nx, ny, nz];
      p[u] += du;
      p[v] += dv;
      return isOpaque(p[0], p[1], p[2]);
    }

    const s00 = solid(-1, 0);
    const s10 = solid(1, 0);
    const s01 = solid(0, -1);
    const s11 = solid(0, 1);
    const c00 = solid(-1, -1);
    const c10 = solid(1, -1);
    const c01 = solid(-1, 1);
    const c11 = solid(1, 1);

    return [
      vertexAO(s00, s01, c00),
      vertexAO(s10, s01, c10),
      vertexAO(s10, s11, c11),
      vertexAO(s00, s11, c01),
    ];
  }

  // Sweep 3 axes
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3; // tangent axis 1
    const v = (d + 2) % 3; // tangent axis 2
    const q = [0, 0, 0];
    q[d] = 1;
    const x = [0, 0, 0];

    const maskSize = dims[u] * dims[v];
    const mask = new Int32Array(maskSize);  // encoded material+AO, or 0, or negative for backface

    // Sweep from -1 to dims[d] (to catch boundary faces)
    for (x[d] = -1; x[d] < dims[d];) {
      // Build mask for this slice
      let n = 0;
      for (x[v] = 0; x[v] < dims[v]; x[v]++) {
        for (x[u] = 0; x[u] < dims[u]; x[u]++) {
          const a = (x[d] >= 0) ? getBlock(x[0], x[1], x[2]) : 0;
          const b = (x[d] < dims[d] - 1) ? getBlock(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0;

          const aOpaque = (x[d] >= 0) ? isOpaque(x[0], x[1], x[2]) : false;
          const bOpaque = (x[d] < dims[d] - 1) ? isOpaque(x[0] + q[0], x[1] + q[1], x[2] + q[2]) : false;

          if (a === b) {
            mask[n] = 0;
          } else if (a !== 0 && !bOpaque) {
            // Front face (positive normal direction)
            const ao = computeAO(x[0], x[1], x[2], d, false);
            mask[n] = encodeMask(a, ao[0], ao[1], ao[2], ao[3]);
          } else if (b !== 0 && !aOpaque) {
            // Back face (negative normal direction) — encode as negative
            const ao = computeAO(x[0] + q[0], x[1] + q[1], x[2] + q[2], d, true);
            mask[n] = -encodeMask(b, ao[0], ao[1], ao[2], ao[3]);
          } else {
            mask[n] = 0;
          }
          n++;
        }
      }
      x[d]++;

      // Greedy merge the mask into rectangles
      n = 0;
      for (let j = 0; j < dims[v]; j++) {
        let i = 0;
        while (i < dims[u]) {
          const maskVal = mask[n];
          if (maskVal !== 0) {
            // Expand width
            let w = 1;
            while (i + w < dims[u] && mask[n + w] === maskVal) w++;

            // Expand height
            let h = 1;
            let done = false;
            while (j + h < dims[v] && !done) {
              for (let k = 0; k < w; k++) {
                if (mask[n + k + h * dims[u]] !== maskVal) {
                  done = true;
                  break;
                }
              }
              if (!done) h++;
            }

            // Emit quad
            const backface = maskVal < 0;
            const encoded = Math.abs(maskVal);
            const matId = decodeMat(encoded);
            const ao = decodeAO(encoded);

            // Quad position
            x[u] = i;
            x[v] = j;

            const du = [0, 0, 0];
            du[u] = w;
            const dv = [0, 0, 0];
            dv[v] = h;

            // World position
            const wx = worldOffsetX + (d === 0 ? x[d] : x[0]);
            const wy = grid.minY + (d === 1 ? x[d] : x[1]);
            const wz = worldOffsetZ + (d === 2 ? x[d] : x[2]);

            const wdu = [0, 0, 0];
            wdu[0] = du[0]; wdu[1] = du[1]; wdu[2] = du[2];

            const wdv = [0, 0, 0];
            wdv[0] = dv[0]; wdv[1] = dv[1]; wdv[2] = dv[2];

            // World positions for 4 corners
            const p0 = [
              worldOffsetX + x[0],
              grid.minY + x[1],
              worldOffsetZ + x[2]
            ];
            const p1 = [p0[0] + wdu[0], p0[1] + wdu[1], p0[2] + wdu[2]];
            const p2 = [p0[0] + wdu[0] + wdv[0], p0[1] + wdu[1] + wdv[1], p0[2] + wdu[2] + wdv[2]];
            const p3 = [p0[0] + wdv[0], p0[1] + wdv[1], p0[2] + wdv[2]];

            // Normal
            const normal = [0, 0, 0];
            normal[d] = backface ? -1 : 1;

            const data = getOrCreate(matId);
            const base = data.vertexCount;

            // Vertices
            const corners = backface ? [p0, p3, p2, p1] : [p0, p1, p2, p3];
            for (let c = 0; c < 4; c++) {
              data.positions.push(corners[c][0], corners[c][1], corners[c][2]);
              data.normals.push(normal[0], normal[1], normal[2]);
              data.uvs.push(c === 1 || c === 2 ? w : 0, c === 2 || c === 3 ? h : 0);
              const brightness = AO_BRIGHTNESS[ao[c]];
              data.colors.push(brightness, brightness, brightness);
            }

            // Indices with AO-aware quad flip
            if (ao[0] + ao[2] > ao[1] + ao[3]) {
              data.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            } else {
              data.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
            }
            data.vertexCount += 4;

            // Clear mask
            for (let l = 0; l < h; l++) {
              for (let k = 0; k < w; k++) {
                mask[n + k + l * dims[u]] = 0;
              }
            }

            i += w;
            n += w;
          } else {
            i++;
            n++;
          }
        }
      }
    }
  }

  // Build Three.js meshes
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
    if (doAO) {
      material.vertexColors = true;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}
