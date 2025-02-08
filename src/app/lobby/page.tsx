"use client";

import React, { Suspense, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase_client"; // adjust the path as needed
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Group, Text } from "@mantine/core";

interface Match {
  id: string;
  player1_name: string | null;
  player2_name: string | null;
  lexicon: string;
  status: string; // e.g. "waiting", "in-progress", "closed"
}

export default function Lobby() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLexicon, setSelectedLexicon] = useState<string>("NWL23");

  const searchParams = useSearchParams();
  const playerName = searchParams.get("playerName") || "";

  // Fetch matches from Supabase.
  useEffect(() => {
    async function fetchMatches() {
      const { data, error } = await supabase.from("matches").select("*");
      if (error) {
        console.error("Error fetching matches:", error);
      } else {
        setMatches(data || []);
      }
      setLoading(false);
    }
    fetchMatches();

    // Subscribe only to INSERT events (for new rows).
    const subscriptionInsert = supabase
      .channel("lobby-channel")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "matches",
        },
        () => {
          fetchMatches();
        }
      )
      // Subscribe to UPDATE events (for changes to existing rows).
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
        },
        (payload) => {
          // Check if the update represents a new join:
          // If the old row didn't have player2_name but the new row does.
          const oldRow = payload.old;
          const newRow = payload.new;
          if (!oldRow?.player2_name && newRow?.player2_name) {
            fetchMatches();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscriptionInsert);
    };
  }, []);

  // When the user clicks "Join", navigate to the match page.
  const handleJoin = async (match: Match) => {
    // Check if the name is already taken.
    if (match?.player1_name && match.player2_name) {
      alert("This room is already full.");
      return;
    }
    if (match.player1_name === playerName) {
      alert("This name is already taken. Please choose a different name.");
      return;
    }
    const { error } = await supabase
      .from("matches")
      .update({ player2_name: playerName })
      .eq("id", match.id);
    if (error) {
      console.error("Error joining match:", error);
      return;
    }
    router.push(
      `/match/${match.id}?playerName=${encodeURIComponent(playerName)}`
    );
  };

  return (
    <Suspense>
      <div style={{ padding: "2rem" }}>
        <h1>Game Lobby</h1>

        <div
          style={{
            marginBottom: "2rem",
            border: "1px solid #ccc",
            padding: "1rem",
            borderRadius: "8px",
          }}
        >
          <h2>Create a New Game</h2>
          <label>
            Select Lexicon:{" "}
            <select
              value={selectedLexicon}
              onChange={(e) => setSelectedLexicon(e.target.value)}
            >
              <option value="NWL23">NWL23</option>
              <option value="CSW24">CSW24</option>
              <option value="dontselectme">
                (Error lexicon, do not select)
              </option>
            </select>
          </label>
          <button
            style={{ marginLeft: "1rem" }}
            onClick={async () => {
              // Generate a random match ID.
              const matchId = Math.random().toString(36).substring(2, 10);
              // Insert a new match into Supabase.
              const { error } = await supabase.from("matches").insert([
                {
                  id: matchId,
                  player1_name: playerName,
                  lexicon: selectedLexicon,
                  status: "waiting",
                  round: 0,
                  player1_score: 0,
                  player2_score: 0,
                },
              ]);
              if (error) {
                console.error("Error creating match:", error);
                return;
              }
              // Redirect to the newly created match.
              router.push(
                `/match/${matchId}?playerName=${encodeURIComponent(
                  playerName
                )}&lexicon=${encodeURIComponent(selectedLexicon)}`
              );
            }}
            disabled={!playerName}
          >
            Create Game
          </button>
        </div>

        {loading ? (
          <p>Loading matches...</p>
        ) : matches.length === 0 ? (
          <p>No matches available. Create a new game!</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0 }}>
            {matches.map((match) => (
              <Card
                key={match.id}
                shadow="sm"
                padding="lg"
                radius="md"
                withBorder
                style={{
                  backgroundColor: match.status === "waiting" ? "#444" : "#888",
                  opacity: match.status === "waiting" ? 1 : 0.6,
                  marginBottom: "1rem",
                }}
              >
                {match.player2_name ? (
                  <Text size="lg">
                    {match.player1_name} vs {match.player2_name}
                  </Text>
                ) : (
                  <Text size="lg">Seeker: {match.player1_name}</Text>
                )}
                <Text>
                  <strong>Lexicon:</strong> {match.lexicon}
                </Text>
                <Text>
                  <strong>Status:</strong> {match.status}
                </Text>
                <Group mt="md">
                  {match.status === "waiting" ? (
                    <Button
                      disabled={!playerName}
                      onClick={() => handleJoin(match)}
                    >
                      Join Game
                    </Button>
                  ) : (
                    <Button disabled style={{ cursor: "not-allowed" }}>
                      In Progress
                    </Button>
                  )}
                </Group>
              </Card>
            ))}
          </ul>
        )}
      </div>
    </Suspense>
  );
}
