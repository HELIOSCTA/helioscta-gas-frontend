SELECT 
    [gas_day]
    ,[pipeline_id]
    ,[pipeline_name]
    ,[pipeline_short_name]
    ,[tariff_zone]
    ,[tz_id]
    ,[state]
    ,[county]
    ,[loc_name]
    ,[location_id]
    ,[location_role_id]
    ,[facility]
    ,[role]
    ,[role_code]
    ,[interconnecting_entity]
    ,[interconnecting_pipeline_short_name]
    ,[meter]
    ,[drn]
    ,[latitude]
    ,[longitude]
    ,[sign]
    ,[cycle_code]
    ,[cycle_name]
    ,[units]
    ,[pipeline_balance_flag]
    ,[storage_flag]
    ,[scheduled_cap]
    ,[signed_scheduled_cap]
    ,[no_notice_capacity]
    ,[operational_cap]
    ,[available_cap]
    ,[design_cap]

FROM [noms_v1_2026_jan_02].[source_v1_genscape_noms]

WHERE 
    pipeline_name like '%Algonquin Gas Transmission%'
    AND gas_day >= '2026-02-01'

ORDER BY gas_day desc
