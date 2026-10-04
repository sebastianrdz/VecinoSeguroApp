-- VecinoSeguro — Milestone A
-- Enums. Names and labels match CONTRACT.md EXACTLY.

create type public.user_role as enum ('neighbor', 'admin');

create type public.user_status as enum ('pending', 'active', 'blocked');

create type public.gate_command_status as enum ('pending', 'sent', 'done', 'failed');

create type public.gate_result as enum ('success', 'failed');

create type public.event_source as enum ('app', 'pi', 'system');
