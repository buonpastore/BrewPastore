-- Costo medio: la spedizione di un ordine si ripartisce in proporzione al prezzo di ogni articolo
-- sul valore della merce dell'ordine. Se alcune righe sono state cancellate (es. import sbagliati),
-- il valore della merce si prende dal totale dell'ordine (totale − spedizione), così la spedizione
-- non viene caricata tutta sulle righe rimaste.
create or replace view public.material_costs with (security_invoker = true) as
with tot as (
  select pi.purchase_id, sum(pi.total_price) as items_sum
  from public.purchase_items pi
  group by pi.purchase_id
), base as (
  select p.id as purchase_id, p.shipping_cost,
         case when p.total_amount is not null and p.total_amount - p.shipping_cost > tot.items_sum + 0.01
              then p.total_amount - p.shipping_cost
              else tot.items_sum end as goods
  from public.purchases p
  join tot on tot.purchase_id = p.id
), items as (
  select pi.material_id,
         public.to_base_qty(pi.quantity, pi.unit) as qty_base,
         pi.total_price
           + case when b.goods > 0 then b.shipping_cost * pi.total_price / b.goods else 0 end as cost
  from public.purchase_items pi
  join base b on b.purchase_id = pi.purchase_id
)
select m.id as material_id, m.name, m.category, m.base_unit,
       coalesce(sum(i.qty_base), 0)                         as qty_purchased,
       coalesce(sum(i.cost), 0)                             as total_spent,
       case when sum(i.qty_base) > 0 then sum(i.cost) / sum(i.qty_base) end as avg_unit_cost,
       count(i.*)                                           as purchases_count
from public.materials m
left join items i on i.material_id = m.id
group by m.id;

notify pgrst, 'reload schema';
