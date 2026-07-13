import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * Server Supabase client bound to the request's cookies. Used by the magic-link
 * callback route to exchange the auth code for a session and persist it.
 */
export function createClient() {
  const { url, publishableKey } = supabaseEnv();
  const cookieStore = cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[],
      ) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
