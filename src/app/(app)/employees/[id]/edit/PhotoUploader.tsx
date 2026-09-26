"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ImagePlus, Loader2, Trash2 } from "lucide-react"

const MAX_EDGE = 800

// Downscale to a JPEG with a max edge of 800px. Phone photos are often several
// MB, over Vercel's ~4.5MB request limit; a profile avatar never needs more.
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process image"))), "image/jpeg", 0.88)
  )
}

// Uploads/removes immediately via /api/employees/[id]/photo — independent of
// the page's "Save Changes".
export function PhotoUploader({
  employeeId,
  initialUrl,
  initials,
}: {
  employeeId: string
  initialUrl: string | null
  initials: string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setError(null)
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image (JPG, PNG, WEBP or GIF).")
      return
    }
    setBusy("upload")
    try {
      const fd = new FormData()
      fd.append("file", await shrinkImage(file), "photo.jpg")
      const res = await fetch(`/api/employees/${employeeId}/photo`, { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Failed to upload photo")
      setUrl(data.profilePhotoUrl)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload photo")
    } finally {
      setBusy(null)
    }
  }

  async function remove() {
    setError(null)
    setBusy("remove")
    try {
      const res = await fetch(`/api/employees/${employeeId}/photo`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to remove photo")
      setUrl(null)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove photo")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Profile photo" className="h-20 w-20 rounded-full object-cover border border-border shrink-0" />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xl font-bold">
          {initials}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!!busy}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
            {url ? "Replace photo" : "Upload photo"}
          </button>
          {url && (
            <button
              type="button"
              onClick={remove}
              disabled={!!busy}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
            >
              {busy === "remove" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Remove
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">JPG, PNG, WEBP or GIF. Saved immediately.</p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) upload(file)
        }}
      />
    </div>
  )
}
