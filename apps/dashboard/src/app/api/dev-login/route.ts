import { createClient } from "@midday/supabase/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const access_token = url.searchParams.get("access_token");
  const refresh_token = url.searchParams.get("refresh_token");

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: "missing tokens" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/", req.url));
}
