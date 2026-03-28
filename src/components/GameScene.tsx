"use client";

import { Canvas } from "@react-three/fiber";
import { Sky, PointerLockControls, Stats } from "@react-three/drei";
import { Suspense } from "react";
import { World } from "./World";
import { getConfig } from "../game/config";

export function GameScene() {
  const config = getConfig();

  return (
    <div className="w-screen h-screen">
      <Canvas
        shadows={config.render.shadows}
        camera={{ fov: 70, near: 0.1, far: 500, position: [100, 10, 100] }}
        gl={{ antialias: false, powerPreference: "high-performance" }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[200, 150, 100]}
          intensity={1.0}
          castShadow={config.render.shadows}
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-far={200}
          shadow-camera-left={-100}
          shadow-camera-right={100}
          shadow-camera-top={100}
          shadow-camera-bottom={-100}
        />

        {/* Sky */}
        <Sky sunPosition={[200, 150, 100]} />

        {/* Fog */}
        {config.render.fog && (
          <fog attach="fog" args={["#87CEEB", 80, 350]} />
        )}

        {/* World */}
        <Suspense fallback={null}>
          <World />
        </Suspense>

        {/* FPS pointer lock controls */}
        <PointerLockControls />

        {/* Debug stats */}
        {config.debug && <Stats />}
      </Canvas>

      {/* HUD */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/60 px-4 py-2 rounded-lg backdrop-blur-sm">
        Click to start — WASD move, Mouse look, Space jump, Shift sprint
      </div>
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 text-white text-xs bg-black/50 px-3 py-1.5 rounded-lg backdrop-blur-sm">
        V: mount/dismount — 1: Airplane — 2: Magic Carpet — 3: Hot Air Balloon — E: boost
      </div>
    </div>
  );
}
