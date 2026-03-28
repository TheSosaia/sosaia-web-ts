/**
 * Game configuration — toggle features on/off for development and performance tuning.
 */

export interface RenderConfig {
  faceCulling: boolean;
  greedyMeshing: boolean;
  textures: boolean;
  ambientOcclusion: boolean;
  shadows: boolean;
  fog: boolean;
  postProcessing: boolean;
}

export interface PhysicsConfig {
  collision: boolean;
  gravity: boolean;
}

export interface GameConfig {
  render: RenderConfig;
  physics: PhysicsConfig;
  chunkSize: number;
  renderDistance: number;
  debug: boolean;
}

export const DEFAULT_CONFIG: GameConfig = {
  render: {
    faceCulling: true,
    greedyMeshing: true,
    textures: true,
    ambientOcclusion: true,
    shadows: true,
    fog: true,
    postProcessing: false,
  },
  physics: {
    collision: true,
    gravity: true,
  },
  chunkSize: 200,
  renderDistance: 1,
  debug: true,
};

// Singleton config instance
let _config: GameConfig = { ...DEFAULT_CONFIG };

export function getConfig(): GameConfig {
  return _config;
}

export function setConfig(config: Partial<GameConfig>): void {
  _config = { ..._config, ...config };
}
