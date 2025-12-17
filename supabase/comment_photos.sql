-- Supabase SQL migration: comment photos
-- Run this in Supabase SQL Editor.

create table if not exists public.comment_photos (
  id bigint generated always as identity primary key,
  ticket_id bigint not null references public.tickets(id) on delete cascade,
  comment_id bigint not null references public.ticket_comments(id) on delete cascade,
  photo_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists comment_photos_ticket_id_idx on public.comment_photos(ticket_id);
create index if not exists comment_photos_comment_id_idx on public.comment_photos(comment_id);
