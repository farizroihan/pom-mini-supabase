-- Jalankan sekali di Supabase: SQL Editor -> New query -> Run
create table public.transactions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  tanggal date not null,
  produk text not null,
  metode_input text not null,
  nominal double precision not null,
  liter double precision not null,
  harga_jual double precision not null,
  harga_modal double precision not null,
  modal double precision not null,
  keuntungan double precision not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index transactions_user_tanggal on public.transactions (user_id, tanggal);

create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  products jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.transactions enable row level security;
alter table public.settings enable row level security;

create policy "transaksi milik sendiri" on public.transactions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "pengaturan milik sendiri" on public.settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
