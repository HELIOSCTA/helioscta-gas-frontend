select CAST(gas_day AS DATE) AS gas_day
,sum(case when location_role_id = 406450 then scheduled_cap else 0 end) - sum(case when location_role_id = 410510 then scheduled_cap else 0 end) as "Hanover"
,sum(case when location_role_id = 406447 then scheduled_cap else 0 end) - sum(case when location_role_id = 410513 then scheduled_cap else 0 end) as "Stoney Point"
,sum(case when location_role_id = 406458 then scheduled_cap else 0 end) - sum(case when location_role_id = 410512 then scheduled_cap else 0 end) as "Southeast"
,sum(case when location_role_id = 406461 then scheduled_cap else 0 end) - sum(case when location_role_id = 410511 then scheduled_cap else 0 end) as "Oxford"
,sum(case when location_role_id = 406459 then scheduled_cap else 0 end) - sum(case when location_role_id = 410509 then scheduled_cap else 0 end) as "Cromwell"
,sum(case when location_role_id = 406452 then scheduled_cap else 0 end) - sum(case when location_role_id = 410508 then scheduled_cap else 0 end) as "Chaplin"
,sum(case when location_role_id = 406448 then scheduled_cap else 0 end) - sum(case when location_role_id = 410507 then scheduled_cap else 0 end) as "Burrillville"

FROM natgas.nominations
where gas_day >= '@OPR_DATE@'

and location_role_id in ('406450', '410510', '406447', '410513', '406458', '410512', '406461', '410511', '406459', '410509', '406452', '410508', '406448', '410507')

group by gas_day
order by gas_day