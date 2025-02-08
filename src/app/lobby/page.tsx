"use client";

import { Suspense } from "react";
import LobbyContent from "./lobby_content";

export default function LobbyPage() {
  return (
    <Suspense fallback={<div>Loading lobby...</div>}>
      <LobbyContent />
    </Suspense>
  );
}
