-- Run AFTER the code without department heads is live (the previous deploy
-- still queries this table).
drop table if exists public.department_heads;
