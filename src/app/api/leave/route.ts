import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabase_client";

export async function POST(req: Request) {
  // Read the request body as text (or JSON)
  const body = await req.text();
  try {
    const { id } = JSON.parse(body);

    // Option 1: Update the match row to indicate that a player has left.
    const { error } = await supabase
      .from("matches")
      .update({ status: "closed" })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Then, immediately delete the match row.
    const { error: deleteError } = await supabase
      .from("matches")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting match:", deleteError.message);
    }
  } catch (err) {
    console.error(err);
  }
  return NextResponse.json({ ok: "bye" }, { status: 200 });
}
