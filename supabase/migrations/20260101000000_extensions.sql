-- VecinoSeguro — Milestone A
-- Extensions required by later migrations.
-- gen_random_uuid() is built into Postgres core as of v13, but pgcrypto is
-- enabled explicitly for portability across environments/tooling that may
-- still expect it to provide the function.
create extension if not exists pgcrypto with schema extensions;
