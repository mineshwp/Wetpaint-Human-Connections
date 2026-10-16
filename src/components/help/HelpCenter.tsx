"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  BarChart3, Bell, Building2, Bug, CheckCircle2, ChevronDown, ClipboardCheck, Contact, Eye, FileText,
  GraduationCap, KeyRound, Lightbulb, Mail, Rocket, ScrollText, Search, Settings, ShieldCheck, Sparkles,
  User, Users, Wrench, X, type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { HELP_LAST_REVIEWED, type HelpArticle, type HelpFaq, type HelpGuide, type HelpIcon, type HelpWho } from "@/content/help/types"

const ICONS: Record<HelpIcon, LucideIcon> = {
  rocket: Rocket, user: User, graduation: GraduationCap, file: FileText, "bar-chart": BarChart3, users: Users,
  "clipboard-check": ClipboardCheck, shield: ShieldCheck, settings: Settings, bell: Bell, sparkles: Sparkles,
  scroll: ScrollText, wrench: Wrench, mail: Mail, building: Building2, key: KeyRound, eye: Eye, contact: Contact,
}

const WHO_LABEL: Record<HelpWho, string> = { staff: "Staff", manager: "Managers", reviewer: "Reviewers" }

type Hit =
  | { type: "article"; score: number; item: HelpArticle }
  | { type: "faq"; score: number; item: HelpFaq }

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")

/** Every word you type must appear somewhere; title and keyword hits rank highest. */
function search(guide: HelpGuide, query: string): Hit[] {
  const words = norm(query).split(/[^a-z0-9]+/).filter((w) => w.length > 0)
  if (words.length === 0) return []
  const catLabel = new Map(guide.categories.map((c) => [c.id, norm(c.label)]))
  const hits: Hit[] = []

  const rank = (fields: { text: string; weight: number }[]) => {
    let total = 0
    for (const w of words) {
      let best = 0
      for (const f of fields) if (f.text.includes(w)) best = Math.max(best, f.weight)
      if (best === 0) return 0
      total += best
    }
    return total
  }

  for (const a of guide.articles) {
    const score = rank([
      { text: norm(a.title), weight: 6 },
      { text: norm((a.keywords ?? []).join(" ")), weight: 5 },
      { text: norm(a.summary), weight: 3 },
      { text: catLabel.get(a.category) ?? "", weight: 2 },
      { text: norm(a.steps.join(" ") + " " + (a.tips ?? []).join(" ")), weight: 1 },
    ])
    if (score > 0) hits.push({ type: "article", score, item: a })
  }
  for (const f of guide.faqs) {
    const score = rank([
      { text: norm(f.question), weight: 5 },
      { text: norm((f.keywords ?? []).join(" ")), weight: 4 },
      { text: norm(f.answer), weight: 1 },
    ])
    if (score > 0) hits.push({ type: "faq", score: score - 0.5, item: f })
  }
  return hits.sort((a, b) => b.score - a.score)
}

function openFeedback(kind: "problem" | "idea") {
  window.dispatchEvent(new CustomEvent("hc:open-feedback", { detail: kind }))
}

export function HelpCenter({ guide }: { guide: HelpGuide }) {
  const [query, setQuery] = useState("")
  const [cat, setCat] = useState<string>("all")
  const [open, setOpen] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Deep links (#article-id) open and scroll to that article; "/" jumps to search.
  useEffect(() => {
    function fromHash() {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      const article = guide.articles.find((a) => a.id === id)
      const faq = guide.faqs.find((f) => f.id === id)
      const target = article ?? faq
      if (!target) return
      setQuery("")
      setCat(target.category)
      setOpen((cur) => new Set(cur).add(id))
      setTimeout(() => document.getElementById(`help-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60)
    }
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (e.key === "/" && t && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) && !t.isContentEditable) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    fromHash()
    window.addEventListener("hashchange", fromHash)
    document.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("hashchange", fromHash)
      document.removeEventListener("keydown", onKey)
    }
  }, [guide])

  const searching = query.trim().length > 0
  const hits = useMemo(() => (searching ? search(guide, query) : []), [guide, query, searching])
  const articles = guide.articles.filter((a) => cat === "all" || a.category === cat)
  const faqs = guide.faqs.filter((f) => cat === "all" || f.category === cat)
  const catById = useMemo(() => new Map(guide.categories.map((c) => [c.id, c])), [guide])

  function jumpTo(id: string) {
    window.history.replaceState(null, "", `#${id}`)
    window.dispatchEvent(new HashChangeEvent("hashchange"))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Hero + search */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card px-5 py-7 sm:px-8">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{guide.title}</h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{guide.intro}</p>
        <div className="relative mt-5 max-w-2xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. “change my details” or “save a score”"
            aria-label="Search help"
            className="h-12 w-full rounded-xl border border-border bg-white pl-10 pr-10 text-sm text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          {searching ? (
            <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus() }} aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[11px] text-muted-foreground sm:block">/</kbd>
          )}
        </div>
      </section>

      {/* Horizontal topic menu */}
      {!searching && (
        <nav aria-label="Help topics" className="sticky top-0 z-10 -mx-1 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur">
          <ul className="flex w-max min-w-full items-center gap-2">
            {[{ id: "all", label: "All topics", icon: "rocket" as HelpIcon }, ...guide.categories].map((c) => {
              const Icon = ICONS[c.icon]
              const active = cat === c.id
              return (
                <li key={c.id}>
                  <button type="button" onClick={() => setCat(c.id)} aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground/80 hover:bg-muted"
                    )}>
                    {c.id !== "all" && <Icon className="h-3.5 w-3.5" />}
                    {c.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      {searching ? (
        <section aria-live="polite" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {hits.length === 0 ? "No results" : `${hits.length} result${hits.length === 1 ? "" : "s"}`} for <strong className="text-foreground">“{query.trim()}”</strong>
          </p>
          {hits.length === 0 ? <NoResults /> : (
            <ul className="space-y-2">
              {hits.map((h) => h.type === "article"
                ? <ArticleCard key={`a-${h.item.id}`} article={h.item} category={catById.get(h.item.category)?.label} open={open.has(h.item.id)} onToggle={() => toggle(h.item.id)} onOpenRelated={jumpTo} guide={guide} />
                : <FaqCard key={`f-${h.item.id}`} faq={h.item} category={catById.get(h.item.category)?.label} open={open.has(h.item.id)} onToggle={() => toggle(h.item.id)} />)}
            </ul>
          )}
        </section>
      ) : (
        <>
          {cat !== "all" && catById.get(cat) && (
            <p className="text-sm text-muted-foreground">{catById.get(cat)!.blurb}</p>
          )}

          {articles.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">How do I…</h3>
              {cat === "all" ? (
                guide.categories.map((c) => {
                  const list = guide.articles.filter((a) => a.category === c.id)
                  if (list.length === 0) return null
                  const Icon = ICONS[c.icon]
                  return (
                    <div key={c.id} className="space-y-2">
                      <h4 className="flex items-center gap-2 pt-2 text-sm font-semibold text-foreground">
                        <Icon className="h-4 w-4 text-primary" /> {c.label}
                      </h4>
                      <ul className="space-y-2">
                        {list.map((a) => <ArticleCard key={a.id} article={a} open={open.has(a.id)} onToggle={() => toggle(a.id)} onOpenRelated={jumpTo} guide={guide} />)}
                      </ul>
                    </div>
                  )
                })
              ) : (
                <ul className="space-y-2">
                  {articles.map((a) => <ArticleCard key={a.id} article={a} open={open.has(a.id)} onToggle={() => toggle(a.id)} onOpenRelated={jumpTo} guide={guide} />)}
                </ul>
              )}
            </section>
          )}

          {faqs.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Frequently asked questions</h3>
              <ul className="space-y-2">
                {faqs.map((f) => <FaqCard key={f.id} faq={f} open={open.has(f.id)} onToggle={() => toggle(f.id)} />)}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Still stuck */}
      <section className="rounded-2xl border border-border bg-card px-5 py-5 sm:px-6">
        <h3 className="text-base font-semibold text-foreground">Still can&rsquo;t find what you need?</h3>
        <p className="mt-1 text-sm text-muted-foreground">Tell us, and we&rsquo;ll help, or add it to this guide.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => openFeedback("problem")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
            <Bug className="h-4 w-4" /> Report an Issue
          </button>
          <button type="button" onClick={() => openFeedback("idea")}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
            <Lightbulb className="h-4 w-4" /> Share an Idea
          </button>
        </div>
      </section>

      <p className="pb-4 text-center text-xs text-muted-foreground">Help guide last reviewed {HELP_LAST_REVIEWED}.</p>
    </div>
  )
}

function NoResults() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
      <Search className="h-7 w-7 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">We couldn&rsquo;t find a match</p>
      <p className="max-w-sm text-xs text-muted-foreground">Try fewer or different words, pick a topic above, or tell us what you were looking for.</p>
      <button type="button" onClick={() => openFeedback("idea")} className="text-xs font-semibold text-primary hover:underline">Tell us what&rsquo;s missing</button>
    </div>
  )
}

function ArticleCard({ article, category, open, onToggle, onOpenRelated, guide }: {
  article: HelpArticle
  category?: string
  open: boolean
  onToggle: () => void
  onOpenRelated: (id: string) => void
  guide: HelpGuide
}) {
  const [imgOk, setImgOk] = useState(true)
  const related = (article.related ?? []).map((id) => guide.articles.find((a) => a.id === id)).filter((a): a is HelpArticle => !!a)
  return (
    <li id={`help-${article.id}`} className="scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-muted/30">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{article.title}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{article.summary}</span>
          {(category || article.who?.length) && (
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {category && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{category}</span>}
              {article.who?.map((w) => <span key={w} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{WHO_LABEL[w]}</span>)}
            </span>
          )}
        </span>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <ol className="space-y-2.5">
            {article.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          {article.screenshot && imgOk && (
            <figure className="space-y-1.5">
              <a href={article.screenshot.src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={article.screenshot.src} alt={article.screenshot.alt} loading="lazy" onError={() => setImgOk(false)} className="h-auto w-full" />
              </a>
              {article.screenshot.caption && <figcaption className="text-xs text-muted-foreground">{article.screenshot.caption}</figcaption>}
            </figure>
          )}

          {article.tips && article.tips.length > 0 && (
            <ul className="space-y-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              {article.tips.map((t, i) => (
                <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{t}</span></li>
              ))}
            </ul>
          )}

          {related.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">Related:</span>
              {related.map((r) => (
                <button key={r.id} type="button" onClick={() => onOpenRelated(r.id)} className="text-left font-medium text-primary hover:underline">{r.title}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function FaqCard({ faq, category, open, onToggle }: { faq: HelpFaq; category?: string; open: boolean; onToggle: () => void }) {
  return (
    <li id={`help-${faq.id}`} className="scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/30">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{faq.question}</span>
          {category && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">FAQ · {category}</span>}
        </span>
        <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <p className="border-t border-border px-4 py-3 text-sm leading-relaxed text-foreground">{faq.answer}</p>}
    </li>
  )
}
