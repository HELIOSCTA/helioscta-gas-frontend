-----------------------------------------
-----------------------------------------

WITH NEXT_DAY_GAS AS (
    SELECT  

        trade_date
        
        -- HH
        ,AVG(CASE WHEN symbol='XGF D1-IPG' THEN value ELSE NULL END) AS hh_cash

        -- SOUTHEAST
        ,AVG(CASE WHEN symbol='XVA D1-IPG' then value END) AS transco_st85_cash
        ,AVG(CASE WHEN symbol='YV7 D1-IPG' then value END) AS pine_prarie_cash
        
        -- EAST TEXAS
        ,AVG(CASE WHEN symbol='XT6 D1-IPG' then value END) AS waha_cash

        -- NORTHEAST
        ,AVG(CASE WHEN symbol='YFF D1-IPG' then value END) AS transco_zone_5_south_cash
        ,AVG(CASE WHEN symbol='XZR D1-IPG' then value END) AS tetco_m3_cash
        ,AVG(CASE WHEN symbol='X7F D1-IPG' then value END) AS agt_cash
        ,AVG(CASE WHEN symbol='YP8 D1-IPG' then value END) AS iroquois_z2_cash
        
        -- WEST
        ,AVG(CASE WHEN symbol='XKF D1-IPG' then value END) AS socal_cg_cash
        ,AVG(CASE WHEN symbol='XGV D1-IPG' then value END) AS pge_cg_cash

        -- Rockies/Northwest
        ,AVG(CASE WHEN symbol='YKL D1-IPG' then value END) AS cig_cash

    from ice_python.next_day_gas_v1_2025_dec_16
    GROUP BY trade_date
),

-- SELECT * FROM NEXT_DAY_GAS
-- ORDER BY trade_date asc

-----------------------------------------
-----------------------------------------

BALMO AS (
    SELECT  

        trade_date
        
        -- HH
        ,AVG(CASE WHEN symbol='HHD B0-IUS' THEN value ELSE NULL END) AS hh_balmo

        -- SOUTHEAST
        ,AVG(CASE WHEN symbol='TRW B0-IUS' then value END) AS transco_st85_balmo
        ,AVG(CASE WHEN symbol='CVK B0-IUS' then value END) AS pine_prarie_balmo
        
        -- EAST TEXAS
        ,AVG(CASE WHEN symbol='WAS B0-IUS' then value END) AS waha_balmo

        -- NORTHEAST
        ,AVG(CASE WHEN symbol='T5C B0-IUS' then value END) AS transco_zone_5_south_balmo
        ,AVG(CASE WHEN symbol='TSS B0-IUS' then value END) AS tetco_m3_balmo
        ,AVG(CASE WHEN symbol='ALS B0-IUS' then value END) AS agt_balmo
        ,AVG(CASE WHEN symbol='IZS B0-IUS' then value END) AS iroquois_z2_balmo
        
        -- WEST
        ,AVG(CASE WHEN symbol='SCS B0-IUS' then value END) AS socal_cg_balmo
        ,AVG(CASE WHEN symbol='PIG B0-IUS' then value END) AS pge_cg_balmo

        -- Rockies/Northwest
        ,AVG(CASE WHEN symbol='CRS B0-IUS' then value END) AS cig_balmo

    from ice_python.balmo_v1_2025_dec_16    
    GROUP BY trade_date
),

-- SELECT * FROM BALMO
-- ORDER BY trade_date desc

-----------------------------------------
-----------------------------------------

FINAL AS (
    SELECT

        next_day_gas.trade_date

        -- NORTHEAST
        -- transco_zone_5_south
        ,transco_zone_5_south_cash
        ,transco_zone_5_south_balmo
        ,(transco_zone_5_south_cash - transco_zone_5_south_balmo) AS transco_zone_5_south_cash_balmo
        ,(transco_zone_5_south_cash - hh_cash) as transco_zone_5_south_basis
        -- tetco_m3
        ,tetco_m3_cash
        ,tetco_m3_balmo
        ,(tetco_m3_cash - tetco_m3_balmo) AS tetco_m3_cash_balmo
        ,(tetco_m3_cash - hh_cash) as tetco_m3_basis
        -- agt
        ,agt_cash
        ,agt_balmo
        ,(agt_cash - agt_balmo) AS agt_cash_balmo
        ,(agt_cash - hh_cash) as agt_basis
        -- iroquois_z2
        ,iroquois_z2_cash
        ,iroquois_z2_balmo
        ,(iroquois_z2_cash - iroquois_z2_balmo) AS iroquois_z2_cash_balmo
        ,(iroquois_z2_cash - hh_cash) as iroquois_z2_basis

    FROM NEXT_DAY_GAS next_day_gas
    LEFT JOIN BALMO balmo ON next_day_gas.trade_date = balmo.trade_date
)

SELECT * FROM FINAL
WHERE trade_date >= '2026-02-01'
ORDER BY trade_date desc