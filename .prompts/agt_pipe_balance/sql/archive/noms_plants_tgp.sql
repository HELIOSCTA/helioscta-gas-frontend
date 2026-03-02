select CAST(GAS_DAY AS SMALLDATETIME) AS GAS_DAY
,SUM(case when location_role_id  =115796 then scheduled_cap*-1 else 0 end) as "BERKSHIRE POWER SALES"
,SUM(case when location_role_id  =115823 then scheduled_cap*-1 else 0 end) as "BLACKSTONE WORCHESTER"
,SUM(case when location_role_id  =115811 then scheduled_cap*-1 else 0 end) as "MONSON SALES" 
,SUM(case when location_role_id  =115800 then scheduled_cap*-1 else 0 end) as "BOUSQUET SMS BERKSHIRE"
,SUM(case when location_role_id  =116351 then scheduled_cap*-1 else 0 end) as "MILLENNIUM POWER COGEN"
,SUM(case when location_role_id  =115864 then scheduled_cap*-1 else 0 end) as "GRANITE RIDGE ROCKINGH"
,SUM(case when location_role_id  =115815 then scheduled_cap*-1 else 0 end) as "OCEAN ST PROVIDENCE"
,SUM(case when location_role_id  =115818 then scheduled_cap*-1 else 0 end) as "FPLE RISE PROVIDENCE"


from NATGAS.NOMINATIONS 

where gas_day >= '@OPR_DATE@'

and location_role_id in ('115796', '115823', '115811', '115800', '116351', '115864', '115815', '115818')
group by gas_day
order by gas_day