# PropertyIQ

AI-powered UK property and company due-diligence agent. Built for property investment, development, and JV partnership analysis.

## What it does

Enter a UK property address or a company/JV partner name. PropertyIQ queries multiple UK government and property data sources in parallel — Land Registry, Companies House, Planning Data, Environment Agency flood maps, and more — then uses Claude to synthesise the raw API responses into a structured Deal Risk Report.

## Stack

- **Frontend** — React (Vite) + Tailwind CSS
- **Backend** — Node.js + Express
- **AI** — Anthropic Claude (`claude-sonnet-4-6`) with SSE streaming for the analyst summary
- **Data** — UK government open data APIs (free) plus paid Land Registry Title lookups (planned)

## MVP scope

- Companies House — full company profile, directors, PSC, charges, insolvency
- HM Land Registry — Price Paid Data history
- Planning Data GOV.UK — conservation, listed buildings, green belt, Article 4, AONB, etc.
- Environment Agency — flood risk (rivers/sea, surface water, groundwater, reservoir)
- Postcodes.io — postcode → coordinates
- Claude AI synthesis with streaming

## Setup

### Backend

```bash
cd server
npm install
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY (and optional COMPANIES_HOUSE_KEY)
npm run dev
```

The server runs on port `3001` by default.

### Frontend

```bash
cd client
npm install
npm run dev
```

The client runs on port `5173` and proxies API calls to `http://localhost:3001`.

## Environment variables

Backend `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
COMPANIES_HOUSE_KEY=          # Optional — register at developer.company-information.service.gov.uk
LAND_REGISTRY_KEY=            # Optional — for paid Title Register lookups (v1.1)
PORT=3001
ALLOWED_ORIGIN=http://localhost:5173
```

## Architecture

```
Browser
  └─▶ POST /api/property-check { address, postcode }
         │
         ▼
      Express
         │  Promise.allSettled — fires all data-source calls in parallel
         ├─▶ Postcodes.io (lat/lng)
         ├─▶ Land Registry Price Paid
         ├─▶ Planning Data GOV.UK (multiple datasets)
         ├─▶ Environment Agency flood layers
         └─▶ Companies House (for company-check)
         │
         ▼
      Claude (claude-sonnet-4-6)
         │  Streams JSON-formatted Deal Risk Report
         ▼
      SSE → Browser
```

## Data attribution

Reports display data sourced from HM Land Registry, Companies House, GOV.UK Planning Data, and the Environment Agency under the [Open Government Licence](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

## Status

MVP. Phase 2 features (paid Title Register, EPC Register, BGS ground stability, ONS demographics, PDF export, saved reports) are not yet implemented.
