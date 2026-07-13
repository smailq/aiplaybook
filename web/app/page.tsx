import { redirect } from "next/navigation";

/** The app lives at /app; send the root there and let it gate on auth. */
export default function Home() {
  redirect("/app");
}
