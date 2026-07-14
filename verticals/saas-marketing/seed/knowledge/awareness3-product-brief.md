# Awareness3 - Product Brief

> A marketing-facing summary of Awareness3, written as the knowledge base for the Hermes marketing agent.
> Source of truth: the `awareness3` monorepo (README, `docs/awareness3/ARCHITECTURE.md`, `apps/desktop/README.md` + `DESIGN.md` + `CHANGELOG.md`, and the live landing copy in `apps/website/src/App.tsx`).
> Company: Looppl Technology Inc. Contact: hello@looppl.com.

## 1. One-liner

Awareness3 is a Mac app that reads the documents, bills, receipts, and emails you drop in, files them for you, and reminds you about the things that actually need doing.

The tagline in use is **"Stop filing. Start knowing."**
The hero line is **"Most apps just store your stuff. This one actually understands it."**

## 2. What it is

At the product surface, Awareness3 is a **local-first Mac app that turns the paperwork of your life into organized, searchable knowledge and to-dos**.
You point it at a folder, forward an email, or drop in a PDF or a photo of a document, and it reads what is inside, extracts the dates, amounts, names, and companies that matter, and turns them into clean records plus suggested reminders.

Underneath, it is a **personal knowledge platform**, not just a notes editor.
The deeper thesis (from the architecture doc) is that **markdown is the open substrate that both humans and LLMs read and write**, and the editor is just the human window into that substrate.
Everything is stored as portable, inspectable markdown files on your Mac, under your control, while the system perceives and acts on them.

The distinction matters for messaging:
- To a **mainstream user**, it is "a notes app that is aware of what you write" - it reads your stuff and does the busywork.
- To a **power user / early adopter**, it is "a private, local-first knowledge OS built on portable markdown that an AI can safely read and act on."

Both framings are true and are already reflected in the product and site.

## 3. The core value proposition

The promise is a shift from **filing to knowing**.
Today people store documents in folders, inboxes, and photo rolls, and then have to remember what is in them and what to do about them.
Awareness3 removes the manual step: it reads the content, organizes it, and surfaces the actions, while leaving the human in control of every decision.

Three pillars carry the value:
1. **It understands, not just stores.** It reads inside files and emails and pulls out the meaningful facts, instead of leaving you a pile of filenames.
2. **It acts, but only suggests.** An unpaid bill, an expiring policy, a form to return - it surfaces these as simple to-dos. It suggests; you decide. Nothing happens without you.
3. **It is private and portable by design.** Everything lives on your Mac with no account required, you choose whether documents are read online (for speed) or fully on-device, and your data stays as open markdown files you can always export.

## 4. How it works (the user journey)

The current shipped flow is a three-stage ingestion pipeline that runs quietly in the background:

1. **Bring in everything.** Point it at a folder, forward an email, or drop files in - PDFs, photos of paper, screenshots, scans, and the emails that matter. It picks them up the moment they land.
2. **It reads and organizes.** It transcribes each file (local text extraction plus OCR for scans and images) and compiles it into clean records - a neutral "compiled truth" summary backed by exact verbatim quotes from the source, plus a typed record for each person, company, task, or date it finds. Every claim is backed by a quote, so the summary cannot drift from what the document actually says, and a hallucinated citation never lands.
3. **It suggests what is next.** A task extractor reads each new document and decides whether it is asking you to do something - pay an unpaid bill, renew before an expiry, return a form, respond to an official notice - and creates a to-do with a due date and a priority. Marketing, newsletters, and already-paid receipts are ignored, and when it is unsure it leaves you alone.

The illustrative flows on the landing page (concrete and worth reusing in campaigns):
- A PDF electric bill -> reads From / Amount / Due -> a reminder to pay two days before it is due.
- A photo of a cafe receipt -> reads Store / Total / Date -> filed under Meals, searchable for expenses and taxes.
- A screenshot of a school form -> reads what / return-by / needs -> a 2-item checklist before Thursday.
- A flight-confirmation email -> reads route / departs / seat -> added to calendar with a check-in nudge.
- A dentist-appointment email -> reads when / where / bring -> a reminder in time, with "bring your insurance card."
- A subscription-renewal email -> reads service / renews / charge -> a heads-up before you are charged, "keep or cancel?"

## 5. What it keeps track of (the entities)

Awareness3 does not just see files; it sees what is in them, and builds typed records it can connect.
The built-in entity types shown to users are: **People, Companies, Tasks, Schedule, Documents, Email (messages).**

Under the hood every record is a typed **entity**: a `type` plus a small set of `properties` (its frontmatter) plus a markdown `body`, stored at `docs/<type>/<ULID>.md`.
The set of types - the **ontology** - is user-owned and editable in Settings, so the same model spans people, companies, tasks, or anything a user defines.
The marketing line: "That is where it starts. The same understanding extends to whatever new kinds of documents you throw at it next."

## 6. Differentiation and moat

- **Local-first and private.** No account, no profile, no tracking. Data lives on the user's Mac. This is a hard contrast with cloud-first tools (Notion, Mem, Evernote, Google Drive) and a direct answer to AI-privacy anxiety.
- **Privacy is a choice, not a lecture.** Read documents online for speed (via OpenRouter), or switch to fully on-device reading (via a local Ollama model) so nothing ever leaves the machine. The user can switch whenever they like.
- **Portable markdown you own.** Notes are real `.md` files with YAML frontmatter, not rows in a proprietary database. Users can always export. The moat is that data stays portable and inspectable while the system acts on it - you are never locked in.
- **Git-backed, nothing is ever lost.** Every save is one atomic git commit, so there is a complete, recoverable version history instead of a single overwritable copy. This is invisible to mainstream users ("nothing is ever lost, go back to any earlier version") and a strong proof point for power users.
- **Evidence-bound extraction.** Every extracted fact is backed by a verbatim quote from the source; unverifiable claims are dropped. This is a credible, differentiated answer to "AI makes things up."
- **Calm, premium, native Mac craft.** It is designed to feel like it belongs next to Apple's own apps - not dev-tool aesthetics, not a web app in a wrapper.

## 7. Brand, voice, and design

- **Positioning mood:** calm, focused, premium. "A calmer way to keep what matters." A tool that does the busywork and gets out of the way.
- **Voice:** plain, warm, non-technical, reassuring. Users "open it like Notes or TextEdit" and never think about markdown syntax. The user is always in control ("It suggests; you decide," "Your call," "Nothing happens without you").
- **Visual identity:** a radar / concentric-arcs logo (the awareness / perception metaphor), a near-black OKLCH canvas with an "Awareness Azure" accent, General Sans for UI/body and DM Mono for code, a 12px "squircle" shape language, and frosted-glass chrome. Direction: "Brutally Minimal x Liquid-Glass-inspired chrome." Reference points: Apple HIG, iA Writer, Bear - explicitly **not** Linear / Vercel dev-tool energy.
- **Signature gradient:** deep blue -> azure -> teal -> electric green, reserved for the logo and the onboarding hero moment only.
- **Copy anti-patterns to avoid (from the design system):** no "Built for X" / "Designed for Y" cliches; no purple/violet gradients; no Inter/Geist/system-ui as the primary typeface; do not overuse the brand gradient. Keep the calm, confident, jargon-free register.

## 8. Current status and stage

- **Stage:** private / invite-only beta ("Private Beta - macOS"). Spots open in batches. The go-to-market motion today is an **email waitlist** on the marketing site.
- **Platform:** macOS only (current build target). Signed and notarized DMG, with automatic background updates.
- **Pricing:** free during the preview. Pricing is not set yet; beta members "get first word." Public FAQ answer: "The preview is free. We'll share pricing before anything changes."
- **Distribution:** direct download (not the Mac App Store today). Auto-update ships from a public S3 feed.
- **Company:** Looppl Technology Inc. The product is the flagship of a broader "Awareness3 family / OS" vision (a Mac shell host and embedded agents are referenced in internal design docs), but **the first product to market is this desktop app**.
- **What is live vs. coming:** ingestion (folder / drop / email), transcription + OCR, entity extraction, task suggestions, categories/taxonomy, full-text and in-document search, a calm dark/light themed editor, and background auto-update are shipped. A natural-language "just ask your documents" Q&A is the headline **Coming soon** item on the site ("How much did I pay for the paint job last year?" answered from your own files, with the receipts to back it up). A remote HTTP/WS transport exists in the codebase, which points toward future non-Mac clients and sync, but nothing multi-platform is promised publicly yet.

## 9. Target users (ICP) - the strategic question

The site currently speaks to a **broad mainstream audience** ("if you can drop a file into a folder, you can use it").
The open strategic question the founder raised is whether to market to *all users* or to **start with the early adopters who most acutely need it**.
The recommendation for the marketing agent: **treat mass-market copy as the top of funnel, but pick one or two beachhead segments to win first**, because they convert faster, refer more, and generate the case studies that unlock the mainstream.

Candidate beachhead segments, ranked by intensity of pain and fit with what is shipped today:

1. **Freelancers, solopreneurs, and one-person businesses (Mac-using).**
   Acute, recurring, monetizable pain: invoices, receipts, contracts, and tax documents that must be captured, categorized, and never lost.
   The "filed under Meals, searchable for expenses and taxes" flow already speaks directly to them.
   Willing to pay; high word-of-mouth inside creator/indie communities.

2. **The household "default parent" / life-admin manager.**
   Juggling bills, school forms, appointments, renewals, and insurance for a whole family.
   The school-form, dentist, and renewal flows are built for this person.
   Huge, emotionally resonant pain ("drowning in paperwork"), strong sharing behavior.

3. **Privacy-conscious Mac power users and PKM enthusiasts (the Obsidian / iA Writer / Bear crowd).**
   They already value local-first, markdown, and ownership, and they are the natural early-adopter and evangelist base for the "knowledge OS" framing.
   Lower willingness to be sold to, but high credibility and reach if the local-first + portable-markdown + git-history story is told to them directly.

4. **People managing someone else's admin** (caregivers for aging parents, expats handling cross-border paperwork).
   Very high pain, underserved, but a smaller and harder-to-reach top of funnel; a good source of testimonials rather than a primary acquisition channel.

These are **hypotheses to validate**, not conclusions.
The marketing agent's job is to test them against real web research and real campaign/experiment evidence, then concentrate spend on whichever segment shows the strongest signal, and revise.

## 10. Competitive landscape (for positioning research)

- **Apple Notes / stock note apps:** the "just store it" baseline Awareness3 defines itself against ("most apps just store your stuff").
- **Notion / Evernote / Mem:** cloud-first organizers; Awareness3 counters with local-first privacy + ownership.
- **Obsidian / iA Writer / Bear:** local markdown tools loved by power users; Awareness3 adds active understanding and task suggestions on top of the same portable-markdown values.
- **Rewind / Personal-AI / "AI memory" tools:** overlap on the "AI that knows your life" promise; Awareness3 counters with on-device privacy, evidence-bound extraction, and open files.
- **Document scanners / receipt apps (e.g. expense trackers):** narrow single-use tools; Awareness3 is the one calm place all of it lands and connects.

The agent should refresh this landscape with live research, since positioning is only as good as current evidence.

## 11. Proof points and reusable hooks

- "Most apps just store your stuff. This one actually understands it."
- "Stop filing. Start knowing."
- "It does the busywork. You stay in control."
- "One thing in. One less thing to worry about."
- "It doesn't just see files. It sees what's in them."
- "A calmer way to keep what matters."
- Trust strip: "Online or fully on your Mac - your call." / "No account, no tracking." / "Open files you can always export."
- Credibility mechanics worth explaining in longer content: evidence-bound extraction (every fact has a source quote), git-backed history (nothing is ever lost), and the online/on-device privacy switch.

## 12. Constraints and guardrails for marketing

- **Do not over-promise platforms or dates.** It is macOS-only and in private beta; no public multi-platform or pricing commitments.
- **Do not invent social proof.** The site deliberately leaves the waitlist count null pre-launch and leans on honest scarcity ("Invite-only preview - spots open in batches"). Keep that honesty.
- **Privacy claims must stay precise.** "Online for speed, or fully on-device" is the accurate framing; do not claim it is 100% offline by default, because the default reader is a remote model (OpenRouter) unless the user switches to local (Ollama).
- **Keep the calm, non-hype voice.** Avoid AI-hype maximalism and the design system's listed cliches; the brand's edge is restraint and control-in-the-user's-hands.
