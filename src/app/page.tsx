"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase_client";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [lexicon, setLexicon] = useState("NWL23");

  async function createMatch() {
    if (!name.trim()) {
      alert("Please enter your name.");
      return;
    }

    // Generate a random match ID
    const matchId = Math.random().toString(36).substring(2, 10);

    // Create the match with the player's name as player1_name.
    const { error } = await supabase.from("matches").insert([
      {
        id: matchId,
        player1_name: name, // now non-null
        status: "waiting",
        round: 0,
        player1_score: 0,
        player2_score: 0,
        lexicon: lexicon,
      },
    ]);

    if (error) {
      console.error("Error creating match:", error);
      return;
    }

    router.push(
      `/match/${matchId}?playerName=${encodeURIComponent(
        name
      )}&lexicon=${encodeURIComponent(lexicon)}`
    );
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Create a Match</h1>
      <input
        type="text"
        placeholder="Enter your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select value={lexicon} onChange={(e) => setLexicon(e.target.value)}>
        <option value="NWL23">NWL23</option>
        <option value="CSW24">CSW24</option>
      </select>
      <button onClick={createMatch}>Create Match</button>
    </div>
  );
}
