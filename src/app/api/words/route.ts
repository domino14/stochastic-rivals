import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import wordLengths from "../../../data/alphagram_lengths.json";
import { randint } from "@/lib/utils";

type Lexicon = keyof typeof wordLengths;

type LengthKey = keyof (typeof wordLengths)["CSW24"];

export async function GET(request: Request) {
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

  if (!wordLengths[lexicon as Lexicon]) {
    console.error(`Invalid lexicon: ${lexicon}`);
    return new Response(
      JSON.stringify({ error: "Invalid lexicon parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!wordLengths[lexicon as Lexicon][length as LengthKey]) {
    console.error(
      `Invalid length: ${length} for lexicon: ${lexicon}`
    );
    return new Response(
      JSON.stringify({ error: "Invalid length parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const numWords = wordLengths[lexicon as Lexicon][length as LengthKey];
  const randomProb = randint(1, numWords);

  const dbPath = path.join(process.cwd(), "data", `${lexicon}.db`);
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

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

  const solutionsArray = row.solutions.split(",").map((s: string) => s.trim());

  const result = {
    alphagram: row.alphagram,
    solutions: solutionsArray,
  };

  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
}