/**
 * Material registry — maps Sosaia material IDs to Three.js materials.
 * Supports two modes via config.render.textures:
 *   false → flat colored MeshLambertMaterial (fast, for debugging)
 *   true  → procedural 16x16 textures (pixel art look)
 */

import * as THREE from "three";
import { getConfig } from "./config";

// Material ID → hex color (fallback when textures disabled)
const MATERIAL_COLORS: Record<number, string> = {
  1: "#5B8C3E", 2: "#8B6914", 3: "#D4C278", 4: "#7F7F7F", 5: "#9E9E9E",
  6: "#3064B4", 7: "#F0F0F0", 8: "#5C4A3A", 9: "#7A5C2E",
  10: "#2C2C2C", 11: "#B0B0B0", 12: "#6B6B6B", 13: "#A08050",
  14: "#8B4513", 15: "#808080",
  20: "#A0522D", 21: "#5C3317", 22: "#6B6B6B", 23: "#E8E8E8",
  24: "#909090", 25: "#505050", 26: "#D4B896", 27: "#E0CDA8",
  28: "#ECE4D4", 29: "#B8945F", 30: "#4A3728", 31: "#7A6040",
  32: "#C8B88A", 33: "#A85C32", 34: "#8A8A8A", 35: "#9E7E6A",
  36: "#C0C0C0", 37: "#3A3A3A", 38: "#2A2A2A", 39: "#C07040",
  40: "#D4C4B0", 41: "#7A5C40", 42: "#8A8A80", 43: "#7A9EB0",
  44: "#6B4226", 45: "#8B7355", 46: "#3C1414", 47: "#5C9E8A",
  48: "#C0C0C0", 49: "#D07020",
  50: "#5A5A5A", 51: "#8B3A2A", 52: "#2A2A2A", 53: "#C4A878",
  54: "#6B4E2E", 55: "#D4CCB8", 56: "#D0D0D0", 57: "#787878",
  70: "#C8E8FF", 71: "#E0E8F0", 72: "#808890", 73: "#A0A8B0",
  74: "#8B7355", 75: "#4488CC", 76: "#408898", 77: "#606068", 78: "#C0D8E8",
  80: "#8B6914", 81: "#3A2810", 82: "#5C4020", 83: "#B8945F",
  84: "#6B6B6B", 85: "#B8945F", 86: "#8A8A8A", 87: "#6B6B6B",
  88: "#8B4513", 89: "#7A7A7A",
  90: "#6B4E2E", 91: "#3A2810", 92: "#D4C8A0", 93: "#4A3020",
  94: "#6B6B6B", 95: "#5C4020",
  96: "#3A7828", 97: "#2A5C18", 98: "#5C9040", 99: "#1A4A10",
  100: "#6B4E2E", 101: "#B8945F", 102: "#6B6B6B", 103: "#E8E8E8",
  104: "#B02020", 105: "#B02020", 106: "#8B6914", 107: "#6B4E2E",
  110: "#1A1A1A", 111: "#E8D050", 112: "#D03030", 113: "#E8D050",
  114: "#3060D0", 115: "#4A8830", 116: "#3A7020", 117: "#6B5C3A",
  118: "#A0D8F0", 119: "#80B8D8", 120: "#6B5C3A", 121: "#5C4A20",
  122: "#C8B040", 123: "#B8A060", 124: "#C8C8C8", 125: "#4A7828",
  126: "#2A6818", 127: "#5C8830", 128: "#3A6820", 129: "#C8C850",
  130: "#9090A0", 131: "#6B4E2E",
};

const TRANSPARENT_IDS = new Set([6, 70, 71, 72, 73, 74, 75, 76, 77, 78]);

// Caches
const colorMaterialCache = new Map<number, THREE.MeshLambertMaterial>();
const textureMaterialCache = new Map<number, THREE.MeshLambertMaterial>();
let textureGenModule: typeof import("./textureGen") | null = null;

/** Lazy-load textureGen module (only in browser) */
async function getTextureGen() {
  if (!textureGenModule) {
    textureGenModule = await import("./textureGen");
  }
  return textureGenModule;
}

/** Get a flat-colored material */
function getColorMaterial(materialId: number): THREE.MeshLambertMaterial {
  let mat = colorMaterialCache.get(materialId);
  if (mat) return mat;

  const color = MATERIAL_COLORS[materialId] ?? "#FF00FF";
  const isTransparent = TRANSPARENT_IDS.has(materialId);

  mat = new THREE.MeshLambertMaterial({
    color,
    transparent: isTransparent,
    opacity: isTransparent ? 0.6 : 1.0,
  });

  colorMaterialCache.set(materialId, mat);
  return mat;
}

/** Get a textured material (must be called after initTextures) */
function getTextureMaterial(materialId: number): THREE.MeshLambertMaterial {
  let mat = textureMaterialCache.get(materialId);
  if (mat) return mat;

  // Fallback to color if texture not yet generated
  return getColorMaterial(materialId);
}

/** Pre-generate all texture atlases. Call once at startup when textures are enabled. */
export async function initTextures(): Promise<void> {
  const gen = await getTextureGen();
  const allIds = Object.keys(MATERIAL_COLORS).map(Number);

  for (const id of allIds) {
    const atlasCanvas = gen.generateTextureAtlas(id);
    const texture = new THREE.CanvasTexture(atlasCanvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    // Atlas is 4 tiles wide — default UV shows first variant
    // UV mapping handled in mesher (0.25 per variant)
    texture.wrapS = THREE.ClampToEdgeWrapping;

    const isTransparent = TRANSPARENT_IDS.has(id);
    const mat = new THREE.MeshLambertMaterial({
      map: texture,
      transparent: isTransparent,
      opacity: isTransparent ? 0.6 : 1.0,
    });

    textureMaterialCache.set(id, mat);
  }
}

/** Get the number of texture variants per material */
export function getVariantCount(): number {
  return 4;
}

/** Get material for a given ID. Uses config to decide color vs texture. */
export function getMaterial(materialId: number): THREE.MeshLambertMaterial {
  const config = getConfig();
  if (config.render.textures) {
    return getTextureMaterial(materialId);
  }
  return getColorMaterial(materialId);
}
