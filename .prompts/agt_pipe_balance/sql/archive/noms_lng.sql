SELECT CAST(GAS_DAY AS smalldatetime) AS EFFECTIVE_DATE,

max(case when location_role_id  =98089 then scheduled_cap else 0 end) as  "Everett AGT",
max(case when location_role_id  =115844 then scheduled_cap else 0 end) as "Evertt TGP",
max(case when location_role_id  =97947 then scheduled_cap else 0 end) as "NE GateWay - Excelerate", 
max(case when location_role_id  =97948 then scheduled_cap else 0 end) as "NE GateWay - Excellence",
max(case when location_role_id  =97953 then scheduled_cap else 0 end) as "NE GateWay Explorer",

max(case when location_role_id  =111091 then scheduled_cap else 0 end) as "NE GateWay - Express",
max(case when location_role_id  =111093 then scheduled_cap else 0 end) as "NE GateWay - Exquisite",
max(case when location_role_id  =111092 then scheduled_cap else 0 end) as "NE GateWay - Expedient",
max(case when location_role_id  =111094 then scheduled_cap else 0 end) as "NE GateWay - Exemplar",
max(case when location_role_id  =101562 then scheduled_cap else 0 end) as "Canaport",
max(case when location_role_id  =101570 then scheduled_cap*-1 else 0 end) as "Baileyville CAN export",
max(case when location_role_id  =97947 then scheduled_cap else 0 end) + max(case when location_role_id  =97948 then scheduled_cap else 0 end) + max(case when location_role_id  =97953 then scheduled_cap else 0 end) +
max(case when location_role_id  =111091 then scheduled_cap else 0 end) + max(case when location_role_id  =111093 then scheduled_cap else 0 end) + max(case when location_role_id  =111092 then scheduled_cap else 0 end) +
max(case when location_role_id  =111094 then scheduled_cap else 0 end) as "NE Gateway"

FROM NATGAS.NOMINATIONS
WHERE GAS_DAY >= '@OPR_DATE@'

AND LOCATION_ROLE_ID IN ('98089', '115844', '97947', '97948', '97953', '111091', '111093', '111092', '111094', '101562', '101570', '97947', '97948', '97953', '111091',
       '111093', '111092', '111094')

GROUP BY CAST(GAS_DAY AS smalldatetime)
ORDER BY CAST(GAS_DAY AS smalldatetime)
