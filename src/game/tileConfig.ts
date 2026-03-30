/**
 * Tile layout and coordinate mapping for multi-tile streaming.
 *
 * Grid layout (col, row):
 *   tile4(0,2) | tile5(1,2)
 *   tile2(0,1) | tile3(1,1)
 *   tile0(0,0) | tile1(1,0)
 */

export interface TileInfo {
  id: string;
  col: number;
  row: number;
}

export const TILE_LAYOUT: TileInfo[] = [
  { id: "tile0", col: 0, row: 0 },
  { id: "tile1", col: 1, row: 0 },
  { id: "tile2", col: 0, row: 1 },
  { id: "tile3", col: 1, row: 1 },
  { id: "tile4", col: 0, row: 2 },
  { id: "tile5", col: 1, row: 2 },
];

export const CHUNKS_PER_TILE = 10;
export const CHUNK_SIZE = 200;
export const TILE_SIZE = CHUNKS_PER_TILE * CHUNK_SIZE; // 2000m

export function tileWorldOrigin(tileIndex: number): { x: number; z: number } {
  const tile = TILE_LAYOUT[tileIndex];
  return { x: tile.col * TILE_SIZE, z: tile.row * TILE_SIZE };
}

export function worldPosToTile(worldX: number, worldZ: number): number {
  const col = Math.floor(worldX / TILE_SIZE);
  const row = Math.floor(worldZ / TILE_SIZE);
  const index = TILE_LAYOUT.findIndex((t) => t.col === col && t.row === row);
  return index;
}

export function getAdjacentTiles(tileIndex: number): number[] {
  if (tileIndex < 0) return [];
  const tile = TILE_LAYOUT[tileIndex];
  const result: number[] = [];
  for (let i = 0; i < TILE_LAYOUT.length; i++) {
    if (i === tileIndex) continue;
    const other = TILE_LAYOUT[i];
    const dc = Math.abs(tile.col - other.col);
    const dr = Math.abs(tile.row - other.row);
    if (dc <= 1 && dr <= 1) {
      result.push(i);
    }
  }
  return result;
}

export function getTilesWithinDistance(tileIndex: number, maxDist: number): number[] {
  if (tileIndex < 0) return [];
  const tile = TILE_LAYOUT[tileIndex];
  const result: number[] = [];
  for (let i = 0; i < TILE_LAYOUT.length; i++) {
    const other = TILE_LAYOUT[i];
    const dist = Math.max(Math.abs(tile.col - other.col), Math.abs(tile.row - other.row));
    if (dist <= maxDist) {
      result.push(i);
    }
  }
  return result;
}
