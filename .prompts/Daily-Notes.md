# Feb

## (2026-02-26) Thurs Feb 26th

### Deploying-Vercel

I want to refector this repo to have a frontend and backend. This repo will be refactored based on @C:\Users\AidanKeaveny\Documents\github\helioscta-pjm-da\ with a docker container to run both frontend and backend. I want this repo to be called helioscta-gas-frontend.
- Teammate 1: Will inpsect the source repo and implemment a plan to refactor this repo. They will document this implementation plan in .skills\refactor.md
- Teamate 2: Will implement a new database utils for Azure SQL. In my front I want a section and page for historical Genscape Noms. Document this in @.skills\genscape-noms\historicals.md
- Teamate 3: Will implement a plan to deploy this repo to vercel.

## (2026-02-25) Wed Feb 25th

### Pipeline EBBS

I want to aggregate my pipeline scrapes for new current active critical notice (Force majeure, OFO or maintenance) on any US natural gas pipeline. Use this webpage for a listing of all pipelines and their informational posting URLs: https://www.naesb.org/members/urls_of_pipelines.htm

**Task 1**
Aggregate a table of all the pipeline ebbs from https://www.naesb.org/members/urls_of_pipelines.htm and create a table of this pipes in @.skills\pipeline_ebbs.md

**Task 2**
Append to this table which pipeline scrapes have been build from the scripts contained in helioscta_api_scrapes_gas_ebbs\helioscta_api_scrapes_gas_ebbs


### Synmax Prompt

**TASK 1, Critical Pipeline Notices**
Alert me every time there is a new current active critical notice (Force majeure, OFO or maintenance) on any US natural gas pipeline. Use this webpage for a listing of all pipelines and their informational posting URLs: https://www.naesb.org/members/urls_of_pipelines.htm

**search each pipeline individually, look for the informational postings webpage for each pipeline first before using other sources**

When you find a notice put it into a table of all active notices with pipeline name, notice type, posted time, incident start time, expected incident end time and a link to the direct notice.

**TASK 2, Analysis**
For all active critical notices that you discover perform an analysis on the likely impacted points using the 1005_v_pipeline_flow datalinks table. If the notice is brand new then you are unlikely to see any immediate impact in the pipeline flows as that dataset needs to be updated by the pipeline operator in later cycles. Your analysis should include the expected impact for brand new notices and the actual impact based on the pipeline flow data.