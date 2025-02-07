import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function GET(request: Request) {
  // Parse the lexicon from the request URL query parameters.
  const { searchParams } = new URL(request.url);
  const lexicon = searchParams.get("lexicon");

  if (!lexicon) {
    return new Response(
      JSON.stringify({ error: "Lexicon parameter missing" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Adjust the filename path as needed. Here we assume the DB is in a data folder.
  const db = await open({
    filename: `./data/${lexicon}.db`,
    driver: sqlite3.Database,
  });

  // This query selects a random alphagram with length between 7 and 8.
  // It then joins the words table to group all matching words together.
  const row = await db.get(`
    SELECT
      a.alphagram,
      GROUP_CONCAT(w.word, ',') AS solutions
    FROM alphagrams a
    JOIN words w ON a.alphagram = w.alphagram
    WHERE a.length BETWEEN 7 AND 8
    GROUP BY a.alphagram
    ORDER BY RANDOM()
    LIMIT 1
  `);

  if (!row) {
    return new Response(JSON.stringify({ error: "No word found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // GROUP_CONCAT returns a comma-separated string; split it into an array.
  const solutionsArray = row.solutions.split(",").map((s: string) => s.trim());

  const result = {
    alphagram: row.alphagram,
    solutions: solutionsArray,
  };

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
}
