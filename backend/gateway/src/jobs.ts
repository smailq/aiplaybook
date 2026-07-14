/**
 * In-memory store of async agent turns.
 *
 * An agent turn (`hermes -z`) can run for minutes - it researches, reasons, and
 * edits the book on the volume. Holding an HTTP request open for that long times
 * out at the proxy and 500s the client. Instead, POST /ask starts a job and
 * returns its id immediately; the client polls GET /ask/:id until it finishes.
 *
 * There is one machine (and one gateway process) per user with light concurrency,
 * so a process-memory map is enough. Jobs are ephemeral: a machine restart drops
 * in-flight turns, which the client surfaces as a lost request. Finished jobs are
 * pruned after a TTL so the map cannot grow without bound.
 */
import { randomUUID } from "node:crypto";

export type JobStatus = "running" | "done" | "error";

export interface Job {
  status: JobStatus;
  /** Present when status === "done". */
  reply?: string;
  /** Present when status === "error" (a client-safe message). */
  error?: string;
  /** Epoch ms the job was created; used for TTL pruning. */
  createdAt: number;
}

/** How long a finished job stays queryable before it is pruned. */
const JOB_TTL_MS = 30 * 60 * 1000;

export interface JobStore {
  /** Start an agent turn and return its job id. Never rejects. */
  start(run: () => Promise<string>): string;
  /** Look up a job's current state, or undefined if unknown/pruned. */
  get(id: string): Job | undefined;
}

export function createJobStore(now: () => number = Date.now): JobStore {
  const jobs = new Map<string, Job>();

  function prune(): void {
    const t = now();
    for (const [id, job] of jobs) {
      if (job.status !== "running" && t - job.createdAt > JOB_TTL_MS) {
        jobs.delete(id);
      }
    }
  }

  return {
    start(run: () => Promise<string>): string {
      prune();
      const id = randomUUID();
      const job: Job = { status: "running", createdAt: now() };
      jobs.set(id, job);
      // Fire and forget: the turn resolves the job in place. We deliberately do
      // not await it here so the POST can return the id right away.
      run().then(
        (reply) => {
          job.status = "done";
          job.reply = reply;
        },
        (err) => {
          job.status = "error";
          job.error = "agent turn failed";
          console.error(`[gateway] agent turn ${id} failed:`, err);
        },
      );
      return id;
    },
    get(id: string): Job | undefined {
      return jobs.get(id);
    },
  };
}
