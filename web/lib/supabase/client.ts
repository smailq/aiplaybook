"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** Browser Supabase client - holds only the user's own short-lived session. */
export function createClient() {
  const { url, publishableKey } = supabaseEnv();
  return createBrowserClient(url, publishableKey);
}
