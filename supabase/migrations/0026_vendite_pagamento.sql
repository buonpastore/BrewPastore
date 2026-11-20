-- Vendite: come ha pagato chi compra (contanti, PayPal o bonifico)
alter table public.sales add column if not exists payment text not null default 'contanti';
alter table public.sales drop constraint if exists sales_payment_check;
alter table public.sales add constraint sales_payment_check check (payment in ('contanti', 'paypal', 'bonifico'));

notify pgrst, 'reload schema';
