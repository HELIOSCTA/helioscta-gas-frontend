select CAST(GAS_DAY AS SMALLDATETIME) AS GAS_DAY

,sum(case when location_role_id  =101563 then scheduled_cap*-1 else 0 end) as "Newington Power NH"
,sum(case when location_role_id  =101564 then scheduled_cap*-1 else 0 end) as "Bangor Gas ME"
,sum(case when location_role_id  =101576 then scheduled_cap*-1 else 0 end) as "Maine Natgas ME"
,sum(case when location_role_id  =101572 then scheduled_cap*-1 else 0 end) as "CASCO BAY ME"
,sum(case when location_role_id  =101568 then scheduled_cap*-1 else 0 end) as "PSNH - GRANITE STATE NH"



from natgas.nominations where 
gas_day >= '@OPR_DATE@' 
and location_role_id in ('101563','101576', '101572', '101568', '101564')
group by gas_day
order by gas_day