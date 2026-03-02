select CAST(GAS_DAY AS SMALLDATETIME) AS GAS_DAY

,sum(case when location_role_id  =109232 then scheduled_cap*-1 else 0 end) as "New Athens Generating Co"
,sum(case when location_role_id  =109214 then scheduled_cap*-1 else 0 end) + sum(case when location_role_id  =410436 then scheduled_cap*-1 else 0 end) as "Gencon Devon"
,sum(case when location_role_id  =109228 then scheduled_cap*-1 else 0 end) as "Southern CT gas (milford)"
,sum(case when location_role_id  =109212 then scheduled_cap*-1 else 0 end) as "Keyspan Gas (Northport)"
,sum(case when location_role_id  =109223 then scheduled_cap else 0 end) +
sum(case when location_role_id  =109224 then scheduled_cap*-1 else 0 end) as "Bridgeport (Stratford)"

from natgas.nominations where 

gas_day >= '@OPR_DATE@'

and location_role_id in ('109232', '109214', '109228', '109212', '109223', '109224')

group by gas_day
order by gas_day