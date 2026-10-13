"use client"

import { useEffect, useRef } from "react"
import { Bold, Italic, Underline, List, ListOrdered } from "lucide-react"
import { cn } from "@/lib/utils"
import { richToHtml, sanitizeRichText, isRichEmpty } from "@/lib/rich-text"

const PROSE = "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_b]:font-semibold [&_strong]:font-semibold [&_i]:italic [&_em]:italic [&_u]:underline"

/** Read-only display of a rich (or legacy plain-text) value. */
export function RichText({ value, className }: { value: string | null | undefined; className?: string }) {
  return <div className={cn("leading-relaxed break-words", PROSE, className)} dangerouslySetInnerHTML={{ __html: richToHtml(value) }} />
}

const TOOLS = [
  { cmd: "bold", label: "Bold", Icon: Bold },
  { cmd: "italic", label: "Italic", Icon: Italic },
  { cmd: "underline", label: "Underline", Icon: Underline },
  { cmd: "insertUnorderedList", label: "Bullet list", Icon: List },
  { cmd: "insertOrderedList", label: "Numbered list", Icon: ListOrdered },
] as const

/** Small editor: bold, italic, underline, bullet and numbered lists. `value` is only read on mount. */
export function RichTextEditor({ value, onChange, placeholder, minHeight = "5rem", className, autoFocus }: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
  className?: string
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = richToHtml(value)
      if (autoFocus) ref.current.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function emit() {
    const html = sanitizeRichText(ref.current?.innerHTML ?? "")
    onChange(isRichEmpty(html) ? "" : html)
  }

  function run(cmd: string) {
    ref.current?.focus()
    document.execCommand(cmd)
    emit()
  }

  return (
    <div className={cn("rounded-lg border border-border bg-card focus-within:ring-1 focus-within:ring-primary", className)}>
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
        {TOOLS.map(({ cmd, label, Icon }) => (
          <button
            key={cmd}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={e => e.preventDefault()}
            onClick={() => run(cmd)}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Icon size={13} />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onPaste={e => {
          e.preventDefault()
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"))
        }}
        style={{ minHeight }}
        className={cn("px-3 py-2 text-sm focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground", PROSE)}
      />
    </div>
  )
}
