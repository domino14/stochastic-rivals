"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");

  async function goToLobby() {
    if (!name.trim()) {
      alert("Please enter your name.");
      return;
    }
    // Redirect to the lobby with the player's name in the query string.
    router.push(`/lobby?playerName=${encodeURIComponent(name)}`);
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Join the Game Lobby</h1>
      <input
        type="text"
        placeholder="Enter your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <button onClick={goToLobby}>Enter Lobby</button>
    </div>
  );
}
