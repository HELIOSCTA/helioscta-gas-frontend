select distinct
    
    date
    
    ,lower_48

    -- Gulf Coast
    ,gulf_coast
    ,north_louisiana
    ,south_louisiana
    ,other_gulf_coast

    -- Texas
    ,texas

    -- Midwest
    ,mid_con
    ,oklahoma
    ,kansas
    ,arkansas
    
    -- Permian
    ,permian
    ,permian_nm
    ,permian_tx

    -- San Juan
    ,san_juan

    -- Rockies
    ,rockies
    ,piceance_basin
    ,denver_julesberg
    ,north_dakota_and_montana
    ,uinta_basin
    ,green_wind_river_wyoming
    ,powder_river_basin
    ,other_rockies
    ,west

    -- east
    ,east
    ,ohio
    ,sw_pennsylvania
    ,ne_pennsylvania
    ,west_virginia
    ,other_east

from genscape_v1_2025_dec_08.marts_v1_daily_pipeline_production_latest

WHERE 
    EXTRACT(month from date) in (3, 4, 5, 6)
    AND EXTRACT(year from date) >= 2023

ORDER BY date DESC