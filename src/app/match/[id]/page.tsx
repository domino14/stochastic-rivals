"use client";
// pages/match/[id].tsx
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabase_client";
import { useParams, useSearchParams } from "next/navigation";
import { randint } from "@/lib/utils";

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

const MatchPage: React.FC = () => {
  const { id } = useParams();
  const [match, setMatch] = useState<Match | null>(null);
  const [hasJoined, setHasJoined] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [input, setInput] = useState<string>("");

  const searchParams = useSearchParams();
  const queryName = searchParams.get("playerName") || "";
  const [playerName, setPlayerName] = useState(queryName);

  const [allAnswers, setAllAnswers] = useState<string[]>([]);
  const [guessedAnswers, setGuessedAnswers] = useState<string[]>([]);
  console.log("match is", match);
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
      // If the query parameter matches the match record, mark as joined
      if (data.player1_name === queryName) {
        setHasJoined(true);
      }
    };

    fetchMatch();
  }, [id, queryName]);

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

  // 3. Function to let a player join the match.
  const joinMatch = async () => {
    if (match?.player1_name && match.player2_name) {
      alert("This room is already full.");
      return;
    }
    if (!playerName.trim()) {
      alert("Please enter your name.");
      return;
    }
    if (!match) return;

    // Check if the name is already taken.
    if (match.player1_name === playerName) {
      alert("This name is already taken. Please choose a different name.");
      return;
    }

    // Otherwise, update the match with player2_name.
    const { error } = await supabase
      .from("matches")
      .update({ player2_name: playerName })
      .eq("id", id);
    if (error) {
      console.error("Error joining match:", error);
      return;
    }
    setHasJoined(true);
  };

  const startJumble = useCallback(async () => {
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
      status: "in-progress",
      round: (match.round || 0) + 1,
    };

    const { error } = await supabase
      .from("matches")
      .update(updates)
      .eq("id", id);
    if (error) {
      console.error("Error starting jumble:", error);
      return;
    }
  }, [id, match, playerName, fetchRandomQuestion]);

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

  useEffect(() => {
    if (match && match.status === "countdown") {
      const countdownSeconds = 3;
      setCountdown(countdownSeconds);
      setInput("");
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev !== null) {
            if (prev <= 1) {
              clearInterval(interval);
              if (match.player1_name === playerName) {
                startJumble();
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
  }, [match, playerName, startJumble, startRound]);

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

  // If the match record is still loading…
  if (!match) return <div>Loading match...</div>;

  // If the user has not yet joined the match, show a join form.
  if (!hasJoined) {
    return (
      <div style={{ padding: "2rem" }}>
        <h1>Join Match: {id}</h1>
        <input
          type="text"
          placeholder="Enter your name"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />
        <button onClick={joinMatch}>Join Match</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Match: {id}</h1>
      <p>Welcome, {playerName}!</p>
      <p>Lexicon: {match.lexicon}</p>{" "}
      {match.player1_name === playerName && !match.player2_name && (
        <div
          style={{
            marginBottom: "1rem",
            background: "#f0f0f0",
            padding: "1rem",
            borderRadius: "8px",
          }}
        >
          <p>Send this link to your opponent:</p>
          <input
            type="text"
            readOnly
            value={`${window.location.origin}/match/${id}`}
            style={{ width: "100%", padding: "0.5rem", marginBottom: "0.5rem" }}
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
        </div>
      )}
      <p>
        Players: {match.player1_name} vs {match.player2_name}
      </p>
      <p>
        Score: {match.player1_name}: {match.player1_score} –{" "}
        {match.player2_name}: {match.player2_score}
      </p>
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
      {match.status === "countdown" && countdown !== null && (
        <h2>Next round starting in: {countdown}</h2>
      )}
      {match.status === "in-progress" && match.current_alphagram && (
        <div>
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
    </div>
  );
};

export default MatchPage;
