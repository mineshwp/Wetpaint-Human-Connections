-- Private bucket for employee documents (applied 28 Sep 2026).
-- No storage policies: only the service role reads/writes. HR uploads with a
-- one-time signed upload URL from /api/employees/[id]/documents/upload-url;
-- downloads go through /api/documents/[id]/download (access-checked, short
-- signed URL). documents.file_url holds the object path in this bucket.
insert into storage.buckets (id, name, public, file_size_limit)
values ('employee-documents', 'employee-documents', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
