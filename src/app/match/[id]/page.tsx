"use client";
// pages/match/[id].tsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase_client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { randint } from "@/lib/utils";
import { Button, Loader } from "@mantine/core";

interface Match {
  id: string;
  player1_name: string | null;
  player2_name: string | null;
  player1_score: number;
  player2_score: number;
  round: number;
  current_solutions: string | null;
  current_alphagram: string | null;
  status: string; // "waiting", "countdown", "in-progress"
  last_answer?: string | null;
  last_winner?: string | null;
  lexicon: string;
}
const gameTimerSeconds = 15;
const countdownSeconds = 4;
const winningScore = 15;
const nextRoundTimerSeconds = 30;

const MatchPage: React.FC = () => {
  const { id } = useParams();
  const router = useRouter();

  const [match, setMatch] = useState<Match | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gameTimer, setGameTimer] = useState<number | null>(null);
  const [input, setInput] = useState<string>("");

  const searchParams = useSearchParams();
  const playerName = searchParams.get("playerName") || "";

  const [allAnswers, setAllAnswers] = useState<string[]>([]);
  const [guessedAnswers, setGuessedAnswers] = useState<string[]>([]);

  // 1. Fetch the match record when the component mounts.
  useEffect(() => {
    if (!id) return;
    const fetchMatch = async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .eq("id", id)
        .single();
      if (error) {
        console.error("Error fetching match:", error);
        return;
      }
      setMatch(data);
    };

    fetchMatch();
  }, [id, playerName]);

  useEffect(() => {
    function handleBeforeUnload() {
      // Create a small payload with the match id and player name.
      const payload = JSON.stringify({ id, playerName });
      // Use sendBeacon to call your API route.
      navigator.sendBeacon("/api/leave", payload);
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [id, playerName]);

  const fetchRandomQuestion = useCallback(async () => {
    const length = randint(7, 8);
    try {
      const response = await fetch(
        `/api/words?lexicon=${match?.lexicon}&length=${length}`
      );
      const data = await response.json();
      console.log("Random Word:", data);
      // data should be in the form:
      // { alphagram: "EELRSTT", solutions: ["LETTERS", "STERLET", "TRESTLE"] }
      return data;
    } catch (error) {
      console.error("Error fetching random word:", error);
    }
  }, [match?.lexicon]);

  // 2. Subscribe to real-time updates so both players see changes (score, status, etc.)
  useEffect(() => {
    if (!id) return;

    // Create a channel for real-time updates.
    const channel = supabase
      .channel("matches-channel")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log("Realtime update:", payload.new);
          setMatch(payload.new as Match);
          if (payload.new.status === "in-progress") {
            setCountdown(null);
          }
        }
      )
      .subscribe();

    // Clean up the channel on unmount.
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const giveup = useCallback(async () => {
    const { error } = await supabase
      .from("matches")
      .update({ status: "countdown", last_winner: null })
      .eq("id", id);
    if (error) {
      console.error("Error updating status:", error);
      return;
    }
  }, [id]);

  const startJumble = useCallback(
    async (resetScores: boolean) => {
      if (!id || !match) return;

      // Only allow player1 to set the jumble.
      if (match.player1_name !== playerName) {
        console.log("Only player 1 can set the jumble.");
        return;
      }
      console.log("i am ", playerName, "and i will set the jumble");

      const data = await fetchRandomQuestion();
      if (!data) return;
      const { alphagram, solutions } = data;
      // Ensure we sort the solutions for consistency.
      const sortedSolutions = [...solutions].sort();
      const joinedSolutions = sortedSolutions.join(",");

      const updates: Partial<Match> = {
        current_solutions: joinedSolutions,
        current_alphagram: alphagram,
        last_winner: null,
        last_answer: joinedSolutions,
        status: "in-progress",
        round: (match.round || 0) + 1,
      };
      if (resetScores) {
        updates.player1_score = 0;
        updates.player2_score = 0;
        updates.round = 1;
      }

      const { error } = await supabase
        .from("matches")
        .update(updates)
        .eq("id", id);
      if (error) {
        console.error("Error starting jumble:", error);
        return;
      }
    },
    [id, match, playerName, fetchRandomQuestion]
  );

  // 4. Start a round by initiating a countdown.
  // We assume here that only player1 initiates the round.
  const startRound = useCallback(async () => {
    if (!match) return;
    if (match.status !== "waiting") return;

    // Update status to "countdown" in the DB so both clients know a round is starting.
    const { error } = await supabase
      .from("matches")
      .update({ status: "countdown" })
      .eq("id", id);
    if (error) {
      console.error("Error updating status:", error);
      return;
    }
  }, [id, match]);

  const endGame = useCallback(async () => {
    // Update status to "countdown" in the DB so both clients know a round is starting.
    const { error } = await supabase
      .from("matches")
      .update({ status: "gameover-countdown" })
      .eq("id", id);
    if (error) {
      console.error("Error updating status:", error);
      return;
    }
  }, [id]);

  useEffect(() => {
    if (
      match &&
      (match.status === "countdown" || match.status === "gameover-countdown")
    ) {
      const gameHadEnded = match.status === "gameover-countdown";

      if (match.status === "countdown") {
        if (
          match.player1_score === winningScore ||
          match.player2_score === winningScore
        ) {
          endGame();
        }
        setCountdown(countdownSeconds);
      } else {
        setCountdown(nextRoundTimerSeconds);
      }
      setInput("");
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev !== null) {
            if (prev <= 1) {
              clearInterval(interval);
              if (match.player1_name === playerName) {
                startJumble(gameHadEnded);
              }
              return 0;
            }
            return prev - 1;
          }
          return null;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [match, playerName, startJumble, startRound, endGame]);

  useEffect(() => {
    if (match && match.status === "in-progress") {
      setGameTimer(gameTimerSeconds);
      const interval = setInterval(() => {
        setGameTimer((prev) => {
          if (prev !== null) {
            if (prev <= 1) {
              clearInterval(interval);
              if (match.player1_name === playerName) {
                giveup();
              }
              return 0;
            }
            return prev - 1;
          }
          return null;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [match, playerName, giveup]);

  // 6. Handle answer submission.
  const submitAnswer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!match || !match.current_solutions) return;

    const normalizedInput = input.trim().toUpperCase();
    console.log(allAnswers);
    // Check if the submitted answer is valid.
    const isValid = allAnswers.some(
      (answer) => answer.toUpperCase() === normalizedInput
    );
    if (!isValid) {
      console.log("Invalid answer.");
      setInput("");
      return;
    }

    const alreadyGuessed = guessedAnswers.some(
      (answer) => answer.toUpperCase() === normalizedInput
    );
    if (alreadyGuessed) {
      console.log("Already guessed.");
      setInput("");
      return;
    }

    const newGuesses = [...guessedAnswers, normalizedInput];
    newGuesses.sort(); // keep sorted for consistency
    setGuessedAnswers(newGuesses);
    setInput("");
    console.log(`Guessed ${newGuesses.length} out of ${allAnswers.length}`);

    if (newGuesses.length === allAnswers.length) {
      const joinedGuesses = newGuesses.join(",");

      // Call the stored procedure "submit_answer"
      const { data, error } = await supabase.rpc("submit_answer", {
        p_match_id: id,
        p_submitted_answer: joinedGuesses,
        p_player_name: playerName,
      });

      if (error) {
        console.error("Error submitting answer:", error);
        return;
      }

      // You could check the returned data (if the function returns a boolean)
      console.log("submit_answer result:", data);
    }

    setInput("");
    // The stored procedure will update the match row.
    // The real-time subscription should pick up the change and update the UI.
  };

  // 7. Automatically start a round if both players are present, match is waiting,
  // and if the current client is player1 (to avoid duplicate countdowns).
  useEffect(() => {
    if (
      match &&
      match.player1_name &&
      match.player2_name &&
      match.status === "waiting"
    ) {
      if (match.player1_name === playerName) {
        startRound();
      }
    }
  }, [match, playerName, startRound]);

  useEffect(() => {
    // Set our local state for the round.
    if (match?.current_solutions) {
      setAllAnswers(match?.current_solutions?.split(","));
    }
    setGuessedAnswers([]);
  }, [match?.current_solutions]);

  async function handleBackToLobby() {
    // Call your leave endpoint explicitly before navigating away.
    // Using fetch with keepalive can help send the request even during navigation.
    await fetch("/api/leave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      // Using keepalive so the request isn't canceled on navigation.
      keepalive: true,
      body: JSON.stringify({
        id: match?.id, // Make sure you have the current match ID in scope
        playerName,
      }),
    });

    // Then, navigate back to the lobby.
    router.push(`/lobby?playerName=${encodeURIComponent(playerName)}`);
  }

  // If the match record is still loading…
  if (!match) return <div>Your opponent has left. The match is closed.</div>;

  return (
    <div style={{ padding: "2rem" }}>
      <Button onClick={handleBackToLobby}>Back to Lobby</Button>
      <p>Welcome, {playerName}!</p>
      <p>
        {gameTimerSeconds}-second timers per question; first to {winningScore}{" "}
        pts wins!
      </p>
      <p>Lexicon: {match.lexicon}</p>{" "}
      {match.player1_name === playerName && !match.player2_name ? (
        <>
          {/* <div
            style={{
              marginBottom: "1rem",
              background: "#525252",
              padding: "1rem",
              borderRadius: "8px",
            }}
          >
            <p>
              Send this link to your opponent, or wait for someone to join...
            </p>
            <input
              type="text"
              readOnly
              value={`${window.location.origin}/match/${id}`}
              style={{
                width: "100%",
                padding: "0.5rem",
                marginBottom: "0.5rem",
              }}
            />
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  `${window.location.origin}/match/${id}`
                )
              }
            >
              Copy Link
            </button>
          </div> */}
          <Loader />
        </>
      ) : (
        <>
          <p>
            Players: {match.player1_name} vs {match.player2_name}
          </p>
          <p>
            Score: {match.player1_name}: {match.player1_score} –{" "}
            {match.player2_name}: {match.player2_score}
          </p>
        </>
      )}
      {match.status === "gameover-countdown" && (
        <>
          <div>Game is over!</div>

          <h3>The last answer was {match.last_answer}</h3>
        </>
      )}
      {match.status === "countdown" &&
        countdown !== null &&
        match.last_winner && (
          <div>
            {match.last_winner === playerName ? (
              <h2>You won this round!</h2>
            ) : (
              <h2>Your opponent won this round!</h2>
            )}
            <h3>The last answer was {match.last_answer}</h3>
          </div>
        )}
      {match.status === "countdown" &&
        countdown !== null &&
        !match.last_winner &&
        match.last_answer && (
          <div>
            <h2>No one won this round! :(</h2>
            <h3>The last answer was {match.last_answer}</h3>
          </div>
        )}
      {(match.status === "countdown" ||
        match.status === "gameover-countdown") &&
        countdown !== null && (
          <h2>
            {match.status === "countdown" ? "Next round" : "New game"} starting
            in: {countdown}
          </h2>
        )}
      {match.status === "in-progress" && match.current_alphagram && (
        <div>
          <h2>Time left: {gameTimer} s.</h2>
          <h2>
            Unscramble the letters:{" "}
            <span style={{ fontFamily: "monospace" }}>
              {match.current_alphagram}
            </span>
          </h2>
          {allAnswers.length > 0 && (
            <p>
              Solved: {guessedAnswers.length} / {allAnswers.length}
            </p>
          )}
          <form onSubmit={submitAnswer}>
            <input
              type="text"
              autoFocus
              value={input}
              placeholder="Type your answer"
              onChange={(e) => setInput(e.target.value)}
            />
          </form>
        </div>
      )}
      {match.status === "waiting" &&
        match.player1_name &&
        match.player2_name && (
          <div>
            <p>Waiting for round to start...</p>
            {/* Optionally, allow player1 to manually start the round */}
            {match.player1_name === playerName && (
              <button onClick={startRound}>Start Round</button>
            )}
          </div>
        )}
      {match.status === "closed" && (
        <div
          style={{ background: "#744", padding: "1rem", borderRadius: "8px" }}
        >
          <h2>Your opponent has left the game.</h2>
          <p>The match will be closed.</p>
        </div>
      )}
    </div>
  );
};

export default MatchPage;
