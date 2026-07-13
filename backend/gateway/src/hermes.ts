/**
 * Agent invocation for Phase 0.
 *
 * First cut (per docs/phase-0-plan.md §4.3): shell out to the scripted one-shot
 *   hermes -z "<prompt>"
 * which we have already validated end to end. This runs a fresh agent turn per
 * request - fine for one or two testers. The responsive `hermes serve` proxy is
 * a later upgrade once its API is confirmed.
 *
 * Cost/usage is not tracked here: spend is metered upstream by OpenRouter (and
 * later LiteLLM), capped by the OpenRouter key credit limit.
 */
import { execFile } from "node:child_process";

export interface AskResult {
  reply: string;
}

export interface HermesRunner {
  ask(prompt: string): Promise<AskResult>;
}

export interface HermesOptions {
  hermesBin: string;
  hermesHome: string;
  /** Inference provider, e.g. "openrouter". Empty = let the agent config decide. */
  provider?: string;
  /** Model id. Empty = use the agent's config default. */
  model?: string;
  /** Cap on a single agent turn. */
  timeoutMs?: number;
}

function execFileAsync(
  file: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeout: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd: opts.cwd, env: opts.env, timeout: opts.timeout, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          (error as Error & { stdout?: string; stderr?: string }).stdout = stdout;
          (error as Error & { stdout?: string; stderr?: string }).stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/** The production runner: invokes the real `hermes` CLI. */
export function createHermesRunner(opts: HermesOptions): HermesRunner {
  const timeout = opts.timeoutMs ?? 120_000;
  const baseArgs: string[] = [];
  if (opts.provider) baseArgs.push("--provider", opts.provider);
  if (opts.model) baseArgs.push("-m", opts.model);
  return {
    async ask(prompt: string): Promise<AskResult> {
      const { stdout } = await execFileAsync(
        opts.hermesBin,
        ["-z", prompt, ...baseArgs],
        {
          cwd: opts.hermesHome,
          env: { ...process.env, HERMES_HOME: opts.hermesHome },
          timeout,
        },
      );
      return { reply: stdout.trim() };
    },
  };
}
