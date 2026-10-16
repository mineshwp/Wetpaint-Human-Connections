// Shape of the in-app Help content. The text lives in staff.ts and admin.ts and
// is rendered by src/components/help/HelpCenter.tsx. Review both files (and
// refresh the screenshots in /public/help) every 3 months or when a feature
// ships — bump HELP_LAST_REVIEWED below when you do.

export const HELP_LAST_REVIEWED = "October 2026"

/** Names the HelpCenter component maps to lucide-react icons. */
export type HelpIcon =
  | "rocket"
  | "user"
  | "graduation"
  | "file"
  | "bar-chart"
  | "users"
  | "clipboard-check"
  | "shield"
  | "settings"
  | "bell"
  | "sparkles"
  | "scroll"
  | "wrench"
  | "mail"
  | "building"
  | "key"
  | "eye"
  | "contact"

export type HelpWho = "staff" | "manager" | "reviewer"

export interface HelpCategory {
  id: string
  label: string
  icon: HelpIcon
  /** One short line shown under the category name. */
  blurb: string
}

export interface HelpArticle {
  id: string
  /** HelpCategory.id */
  category: string
  /** Phrased as a question: "How do I …?" */
  title: string
  /** One plain sentence: what you will be able to do after reading. */
  summary: string
  /** Numbered steps, in order. Use the exact button/tab names shown in the app. */
  steps: string[]
  /** Optional extra hints, warnings or "good to know" lines. */
  tips?: string[]
  /** Staff guide only: who the article is for. Omit when it applies to everyone. */
  who?: HelpWho[]
  /** Extra words people might search for (synonyms, old names). */
  keywords?: string[]
  /** Screenshot in /public/help, e.g. "/help/staff-my-kpi.png". Hidden if the file is missing. */
  screenshot?: { src: string; alt: string; caption?: string }
  /** Other HelpArticle ids to link at the bottom. */
  related?: string[]
}

export interface HelpFaq {
  id: string
  category: string
  question: string
  /** Plain text, 1–3 short sentences. */
  answer: string
  keywords?: string[]
}

export interface HelpGuide {
  audience: "staff" | "admin"
  title: string
  intro: string
  categories: HelpCategory[]
  articles: HelpArticle[]
  faqs: HelpFaq[]
}
