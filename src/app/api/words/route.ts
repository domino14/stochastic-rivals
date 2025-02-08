import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import wordLengths from "../../../data/alphagram_lengths.json";
import { randint } from "@/lib/utils";

type Lexicon = keyof typeof wordLengths;

type LengthKey = keyof (typeof wordLengths)["CSW24"];

export async function GET(request: Request) {
  // Parse the lexicon from the request URL query parameters.
  const { searchParams } = new URL(request.url);
  const lexicon = searchParams.get("lexicon");
  const length = searchParams.get("length");

  if (!lexicon) {
    return new Response(
      JSON.stringify({ error: "Lexicon parameter missing" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!length) {
    return new Response(JSON.stringify({ error: "Length parameter missing" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const numWords = wordLengths[lexicon as Lexicon][length as LengthKey];
  if (!numWords) {
    return new Response(JSON.stringify({ error: "No num words found" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const randomProb = randint(1, numWords);

  const dbPath = path.join(process.cwd(), "data", `${lexicon}.db`);
  // Adjust the filename path as needed. Here we assume the DB is in a data folder.
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // This query selects a random alphagram with length between 7 and 8.
  // It then joins the words table to group all matching words together.
  const row = await db.get(
    `
    SELECT
      a.alphagram,
      GROUP_CONCAT(w.word, ',') AS solutions
    FROM alphagrams a
    JOIN words w ON a.alphagram = w.alphagram
    WHERE a.length = $length
    AND a.probability = $randomProb
    GROUP BY a.alphagram
    LIMIT 1
  `,
    {
      $length: length,
      $randomProb: randomProb,
    }
  );

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
