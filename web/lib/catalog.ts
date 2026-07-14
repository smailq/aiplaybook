/**
 * The playbook catalog shown on the bookshelf (`/library`).
 *
 * These are the *display* fields for each playbook product. The canonical
 * definition of a product - onboarding, seed, skills, and the same metadata -
 * lives in its vertical bundle (`verticals/<id>/bundle.json`), which provisioning
 * reads. This file mirrors the bundle's display fields because the frontend
 * builds with `web/` as its root and cannot import from outside it; keep the two
 * in sync when a product's metadata changes.
 */

export type BookStatus = "in-development" | "available";

export interface CatalogBook {
  /** URL slug and bundle id, e.g. "saas-marketing". */
  slug: string;
  title: string;
  tagline: string;
  status: BookStatus;
  /** Colors for the CSS-rendered cover. */
  cover: { color: string; accent: string };
  /** Bullet list shown on the detail page. */
  whatToExpect: string[];
  /** A few onboarding questions previewed on the detail page. */
  onboardingPreview: string[];
}

export const CATALOG: CatalogBook[] = [
  {
    slug: "saas-marketing",
    title: "SaaS Marketing Playbook",
    tagline:
      "A living go-to-market plan for your SaaS - authored by AI, edited by marketing experts, and revised as results come in.",
    status: "in-development",
    cover: { color: "#2f4a3f", accent: "#c9a24b" },
    whatToExpect: [
      "A positioning chapter that nails who it is for and the one-sentence promise.",
      "A channel and messaging roadmap, prioritized by expected impact on your north-star metric.",
      "Ready-to-run experiment cards with pre-registered win/lose thresholds, and draft copy marked for your review.",
      "An evidence log so every recommendation traces back to research or a real result.",
      "Sections that are versioned like software releases and sharpen as you report what happened.",
    ],
    onboardingPreview: [
      "What your product is and the one sentence that describes it.",
      "Who it is for today, and what stage you are at.",
      "The one metric that matters most right now.",
      "Which channels you have tried, and how they went.",
    ],
  },
];

export function getBook(slug: string): CatalogBook | undefined {
  return CATALOG.find((b) => b.slug === slug);
}

export function statusLabel(status: BookStatus): string {
  return status === "available" ? "Available" : "In development";
}
