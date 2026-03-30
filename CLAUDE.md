@AGENTS.md

# Sosaia Web Client

## Quick Start
```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Architecture
- Next.js + React Three Fiber (Three.js) voxel city viewer
- Loads **precomputed meshes** from Rust pipeline — zero runtime meshing
- Two data sources per chunk:
  - `meshes/<city>/` — precomputed vertex buffers (.mesh.bin) for rendering
  - `chunks/<city>/` — raw block data (.bin) for physics collision
- LOD auto-switching via THREE.LOD (3 levels per chunk)

## Key Files
- `src/components/World.tsx` — World loader + game loop
- `src/game/meshLoader.ts` — .mesh.bin parser → THREE.BufferGeometry + LOD
- `src/game/chunkLoader.ts` — Raw block .bin loader for physics
- `src/game/voxelGrid.ts` — 3D voxel grid for collision
- `src/game/playerPhysics.ts` — Movement + collision
- `src/game/materials.ts` — Material ID → Three.js material
- `src/game/vehicles.ts` — Vehicle system
- `src/game/network.ts` — WebSocket multiplayer
- `src/game/config.ts` — Runtime config

## Data Flow
```
public/meshes/<city>/manifest.json → loadMeshManifest()
public/meshes/<city>/*.mesh.bin    → loadMeshChunkLOD() → THREE.LOD → scene
public/chunks/<city>/manifest.json → ChunkLoader.loadManifest()
public/chunks/<city>/*.bin         → ChunkLoader.loadChunk() → VoxelGrid → physics
```

## Mesh Binary Format (.mesh.bin)
```
Header (10 bytes):
  magic: u32 LE = 0x534F534D ("SOSM"), version: u16 LE = 1, chunk_x: i16, chunk_z: i16
Material count: u16 LE
Per material:
  material_id: u16, vertex_count: u32, index_count: u32
  positions: [f32; vertex_count*3], normals: [f32; vertex_count*3]
  colors: [f32; vertex_count*3] (AO baked), indices: [u32; index_count]
```

## LOD Levels
| Level | Suffix | Camera distance | Reduction |
|-------|--------|----------------|-----------|
| LOD0 | .mesh.bin | 0-400m | Full detail |
| LOD1 | .lod1.mesh.bin | 400-1000m | ~7x fewer verts |
| LOD2 | .lod2.mesh.bin | 1000m+ | ~40x fewer verts |

## Related Repos
- `sosaia-preprocessing-rust` — Rust pipeline generating chunk + mesh data from OSM
- `sosaia-backend-go` — Go WebSocket server for multiplayer
