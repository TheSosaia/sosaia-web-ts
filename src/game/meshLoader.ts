/**
 * MeshLoader — loads precomputed .mesh.bin files and creates Three.js geometry directly.
 * Zero runtime meshing — geometry is built in Rust and uploaded straight to the GPU.
 *
 * Format (.mesh.bin):
 *   Header (10 bytes):
 *     magic:       u32 LE = 0x534F534D ("SOSM")
 *     version:     u16 LE = 1
 *     chunk_x:     i16 LE
 *     chunk_z:     i16 LE
 *   Material count: u16 LE
 *   Per material:
 *     material_id:    u16 LE
 *     vertex_count:   u32 LE
 *     index_count:    u32 LE
 *     positions:      [f32 LE; vertex_count * 3]
 *     normals:        [f32 LE; vertex_count * 3]
 *     colors:         [f32 LE; vertex_count * 3]
 *     indices:        [u32 LE; index_count]
 */

import * as THREE from "three";
import { getMaterial } from "./materials";
import { getConfig } from "./config";

const MESH_MAGIC = 0x534f534d; // "SOSM"

export interface MeshManifest {
  city: string;
  bbox: {
    min_lat: number;
    min_lng: number;
    max_lat: number;
    max_lng: number;
  };
  chunk_size_meters: number;
  chunks: {
    x: number;
    z: number;
    file: string;
    vertex_count: number;
    index_count: number;
    material_count: number;
    size_bytes: number;
  }[];
  format: string;
}

export interface LoadedMeshChunk {
  chunkX: number;
  chunkZ: number;
  group: THREE.Group;
}

/** Parse a .mesh.bin buffer into a Three.js Group — no meshing needed */
export function parseMeshBin(buffer: ArrayBuffer): LoadedMeshChunk {
  const view = new DataView(buffer);
  let offset = 0;

  // Header
  const magic = view.getUint32(offset, true); offset += 4;
  if (magic !== MESH_MAGIC) {
    throw new Error(`Invalid mesh magic: 0x${magic.toString(16)}`);
  }

  const version = view.getUint16(offset, true); offset += 2;
  if (version !== 1) {
    throw new Error(`Unsupported mesh version: ${version}`);
  }

  const chunkX = view.getInt16(offset, true); offset += 2;
  const chunkZ = view.getInt16(offset, true); offset += 2;

  const materialCount = view.getUint16(offset, true); offset += 2;

  const config = getConfig();
  const group = new THREE.Group();

  for (let m = 0; m < materialCount; m++) {
    const materialId = view.getUint16(offset, true); offset += 2;
    const vertexCount = view.getUint32(offset, true); offset += 4;
    const indexCount = view.getUint32(offset, true); offset += 4;

    // Read positions (f32 x vertexCount x 3)
    const floatCount = vertexCount * 3;
    const posBytes = floatCount * 4;
    const positions = new Float32Array(buffer.slice(offset, offset + posBytes));
    offset += posBytes;

    // Read normals
    const normals = new Float32Array(buffer.slice(offset, offset + posBytes));
    offset += posBytes;

    // Read colors (AO baked)
    const colors = new Float32Array(buffer.slice(offset, offset + posBytes));
    offset += posBytes;

    // Read indices (u32 x indexCount)
    const idxBytes = indexCount * 4;
    const indices = new Uint32Array(buffer.slice(offset, offset + idxBytes));
    offset += idxBytes;

    // Build geometry — just set buffers, no computation
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingSphere();

    const baseMaterial = getMaterial(materialId);
    const material = baseMaterial.clone();
    if (config.render.ambientOcclusion) {
      material.vertexColors = true;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return { chunkX, chunkZ, group };
}

/** Fetch and load a mesh manifest */
export async function loadMeshManifest(baseURL: string): Promise<MeshManifest> {
  const res = await fetch(`${baseURL}/manifest.json`);
  if (!res.ok) throw new Error(`Failed to load mesh manifest: ${res.status}`);
  return res.json();
}

/** Fetch and parse a single .mesh.bin file */
export async function loadMeshChunk(baseURL: string, filename: string): Promise<LoadedMeshChunk> {
  const res = await fetch(`${baseURL}/${filename}`);
  if (!res.ok) throw new Error(`Failed to load mesh chunk: ${filename}`);
  const buffer = await res.arrayBuffer();
  return parseMeshBin(buffer);
}

/** LOD distance thresholds in world units */
const LOD_DISTANCES = [0, 400, 1000];
/** LOD file suffixes matching Rust pipeline output */
const LOD_SUFFIXES = ["", ".lod1", ".lod2"];

/**
 * Load all LOD levels for a chunk and return a THREE.LOD object.
 * Three.js automatically switches between levels based on camera distance.
 */
export async function loadMeshChunkLOD(
  baseURL: string,
  baseFilename: string,
): Promise<THREE.LOD> {
  const lod = new THREE.LOD();
  const baseName = baseFilename.replace(".mesh.bin", "");

  for (let i = 0; i < LOD_SUFFIXES.length; i++) {
    const filename = `${baseName}${LOD_SUFFIXES[i]}.mesh.bin`;
    try {
      const loaded = await loadMeshChunk(baseURL, filename);
      lod.addLevel(loaded.group, LOD_DISTANCES[i]);
    } catch {
      // LOD level not available, skip
      break;
    }
  }

  return lod;
}
