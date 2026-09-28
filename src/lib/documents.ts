// Employee documents: files live in the private "employee-documents" bucket
// (service role only); documents.file_url holds the object path there.

export const DOCUMENTS_BUCKET = "employee-documents"
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024

export const DOCUMENT_CATEGORIES: Record<string, string> = {
  contract: "Contract",
  id: "ID Document",
  payslip: "Payslip",
  kpi: "KPI",
  training: "Training",
  offer_letter: "Offer Letter",
  tax: "Tax / SARS",
  qualification: "Qualification",
  sick_note: "Sick Note",
  onboarding_doc: "Onboarding",
  other: "Other",
}

/** Safe object path for an upload: `<employeeId>/<random>-<file name>`. */
export function documentPath(employeeId: string, fileName: string): string {
  const safe = fileName.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-120) || "file"
  return `${employeeId}/${crypto.randomUUID()}-${safe}`
}
