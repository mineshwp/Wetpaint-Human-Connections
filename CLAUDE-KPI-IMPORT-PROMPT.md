# Claude Code Prompt — KPI Excel Import Script

> Paste everything below this line into Claude Code.

---

## Task

Write a Python script at `scripts/import_kpi.py` that reads all staff KPI Excel files from `supplied-by-hr/KPIS 2026/`, extracts structured data, and upserts it into Supabase. Run it once when done to confirm it completes without errors.

---

## Context: File Structure

Each staff member has a folder:
```
supplied-by-hr/KPIS 2026/{FirstName}/{FirstName} 2026 KPI Doc.xlsx
```

Example employees: Darren, Divya, Einstein, Gloria, Keegan, Kerry, Lorna, Lungelo, Minesh, Morne, Motshidisi, Nyakallo, Potso, Rea, Sechaba, Simba, Sphiwe, Susan, Suwi, Tapiwa, Thato, Ujala

---

## Context: Excel File Structure (single sheet "Template 26")

All files follow the same layout. Use `openpyxl` with `data_only=True`.

### Employee header (always these cells)
| Cell | Content |
|------|---------|
| B4 | Full name + employee code e.g. `"Darren Maxwell (WP068DL)"` |
| B5 | Job title |
| B6 | Date (datetime) |
| B7 | KPI period e.g. `"Quarter 2 - 2026"` |

### Category 1 — "KPI FOCUS AREAS: PERSONAL & DEPARTMENT"
- Header row: **row 14** → A14 = section title, C14 = scorer1 name, G14 = scorer2 name
- Items: **rows 15, 16, 17** → A = item title (starts with "KPI 1:", "KPI 2:", "KPI 3:"), B = full description, C = scorer1 score (int), G = scorer2 score (int)
- Total row: **row 18**
- ⚠️ These KPI items are **personalised per employee** — each person has different Focus Area titles/descriptions

### Category 2 — "OUR VALUES : TRIBE CONTRACT"
- Header row: **row 21** → A21 = section title, C21 = scorer1 name, G21 = scorer2 name
- Items: **rows 22, 23, 24, 25** → A = value name (CO-ELEVATE, THINK BIGGER, DO IT BETTER, OWN IT), B = description, C = scorer1 score (int), G = scorer2 score (int)
- Total row: **row 26**
- These items are **shared across all employees** (same value names, different descriptions)

### Category 3 — "HR AREAS: TRIBE CONTRACT"
- Header row: **row 28** → A28 = section title, C28 = scorer1 name (Ujala - HR Manager), G28 = scorer2 name (Line Manager)
- Items: **rows 29, 30, 31, 32, 33, 34, 35** → A = item title, B = description, C = scorer1 score (int), G = scorer2 score (int)
- Total row: **row 36**
- These 7 items are **fully shared** across all employees (identical titles and descriptions)

### Scorer name parsing
The scorer name cells contain text like `"Kerry - Score"`, `"Petra Comments"`, `"Ujala - HR Manager Score"`, `"Einstein - Score"`. Extract just the first name (everything before the first space or dash).

---

## Context: Supabase Schema

### Tables to write to

**`kpi_template_sections`**
```
id (uuid, pk), title (text), type ("hr" | "invitee"), position (int), is_active (bool)
```

**`kpi_template_items`**
```
id (uuid, pk), section_id (uuid → kpi_template_sections.id), title (text), description (text), min_score (int), max_score (int), position (int), is_active (bool)
```

**`kpi_reviews`**
```
id (uuid, pk), employee_id (uuid → employees.id), period (text), title (text), deadline (date|null), status ("draft"|"active"|"completed")
```

**`kpi_review_invitees`**
```
id (uuid, pk), review_id (uuid), invitee_id (uuid → employees.id), status ("pending"|"accepted"|"declined"|"completed")
```

**`kpi_scores`**
```
id (uuid, pk), review_id (uuid), item_id (uuid → kpi_template_items.id), scorer_id (uuid|null), score (int|null), comments (text|null)
```
- `scorer_id = NULL` → HR/management scored it (Petra / Ujala / line manager)
- `scorer_id = <employee_id>` → the named invitee scored it

**`employees`** (read-only, for lookups)
```
id, first_name, last_name, employee_code
```

---

## Implementation Requirements

### 1. Supabase client
Use `supabase-py`. Read credentials from `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...    # use the service role key for admin writes
```

Install dependencies if needed: `pip install openpyxl supabase python-dotenv`

### 2. Template sections — upsert by title
Upsert the 3 sections (check if a row with that `title` already exists; update if so, insert if not):

| title | type | position |
|-------|------|----------|
| KPI FOCUS AREAS: PERSONAL & DEPARTMENT | invitee | 1 |
| OUR VALUES : TRIBE CONTRACT | invitee | 2 |
| HR AREAS: TRIBE CONTRACT | hr | 3 |

All sections: `is_active = true`

### 3. Template items — upsert by (section_id, title)

**Category 2 & 3 items** are shared: before the loop over employees, upsert these once using the titles from the first parsed file, with `min_score=0`, `max_score=10`, `is_active=true`. If a row with the same `(section_id, title)` already exists, skip/update.

**Category 1 items** are per-employee: treat these as employee-specific items. Upsert them using the combined key `(section_id, title)`. Because each employee has unique KPI 1/2/3 titles, they will create separate rows in `kpi_template_items`. This is intentional — it allows the app to show personalised focus areas inside each review accordion.

### 4. Employee lookup
Query `employees` table. Build a lookup dict keyed by:
- Normalised first name (lowercase, stripped)
- And also try matching against `employee_code` extracted from the name cell (e.g. `WP068DL`)

If no match is found for an employee file, print a warning and skip that file — do not crash.

### 5. Scorer lookup
After building the employee lookup, build a `scorer_lookup` dict keyed by first name (lowercase). This is used to map scorer names extracted from header cells to `employee_id` values.

### 6. KPI reviews — upsert by (employee_id, period)
For each employee file, create/upsert one `kpi_reviews` row:
- `employee_id` = matched employee's id
- `period` = value from B7 (e.g. `"Quarter 2 - 2026"`)
- `title` = `"KPI Review – {period}"` (e.g. `"KPI Review – Quarter 2 - 2026"`)
- `deadline` = NULL
- `status` = `"active"`

If a review with that `(employee_id, period)` already exists, use it (don't create a duplicate).

### 7. KPI review invitees
For each scorer extracted from the header cells (C column scorer name and G column scorer name), look up their `employee_id` in the scorer lookup. If found and they are not the review's subject employee, upsert a row in `kpi_review_invitees`:
- `review_id` = the review just created
- `invitee_id` = scorer's employee_id
- `status` = `"completed"`

### 8. KPI scores — upsert per item per scorer
For each item row in the Excel file:
- **Column C score** (scorer1): Look up the scorer's employee_id. If found → `scorer_id = that_id`. If scorer is "Ujala" (HR Manager) or maps to no employee → `scorer_id = NULL`.
- **Column G score** (scorer2): Same logic.

Upsert into `kpi_scores` on conflict `(review_id, item_id, scorer_id)`:
```python
{
  "review_id": review_id,
  "item_id": item_id,        # from kpi_template_items
  "scorer_id": scorer_id,    # None or employee uuid
  "score": score_value,      # int from the cell
  "comments": None           # no comment cells in scope yet
}
```

### 9. Output / logging
Print a summary line per employee file:
```
✓ Darren Maxwell (WP068DL) — Q2 2026 — 10 items, 20 scores upserted
✗ [EmployeeName] — employee not found in Supabase, skipped
```

At the end print a total count of reviews and scores written.

---

## Running the script

```bash
cd /path/to/wetpaint-human-connections
pip install openpyxl supabase python-dotenv --break-system-packages
python scripts/import_kpi.py
```

The script must be idempotent — running it twice must not create duplicate rows.

---

## What NOT to do
- Do not touch `src/` — this is a standalone data import script only
- Do not modify `.env.local` or any config files
- Do not use the anon key — use `SUPABASE_SERVICE_ROLE_KEY`
- Do not hardcode any UUIDs — always look them up from Supabase
- Do not skip the upsert logic — the script must be safely re-runnable
