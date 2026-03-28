"use client";

import dynamic from "next/dynamic";

const GameScene = dynamic(
  () => import("../components/GameScene").then((mod) => mod.GameScene),
  { ssr: false }
);

export default function Home() {
  return <GameScene />;
}
