// Generate a formatted Word document from a PropertyIQ Deal Risk Report.
// Uses the official `docx` npm package; output is a Buffer the caller can
// stream back to the browser as a download.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  PageBreak,
  ExternalHyperlink,
} from 'docx';

// Theme colours roughly matching the on-screen Claude palette.
const COLOR_INK = '1F1B16';
const COLOR_CLAUDE = 'D97757';
const COLOR_CLAUDE_700 = '9F4429';
const COLOR_OK = '3B6D11';
const COLOR_WARN = '854F0B';
const COLOR_CRIT = 'A32D2D';
const COLOR_MUTED = '6B7280';
const COLOR_BG_CREAM = 'F5F4ED';

const SEVERITY_COLORS = {
  ok: COLOR_OK,
  warning: COLOR_WARN,
  critical: COLOR_CRIT,
};

export async function buildPropertyDocx(report, _rawData, { investmentMemo, agentResults } = {}) {
  const memoBlocks = investmentMemo ? memoSection(investmentMemo) : [];
  const a = agentResults || {};
  const agentBlocks = [
    ...(a.comparables ? [...sectionHeaderArr('Market comparables (AI agent)'), ...comparablesAgentSection(a.comparables)] : []),
    ...(a.avm ? [...sectionHeaderArr('AVM / Sale valuation (AI agent)'), ...avmAgentSection(a.avm)] : []),
    ...(a.hmoRents ? [...sectionHeaderArr('HMO rents & yields (AI agent)'), ...hmoRentsAgentSection(a.hmoRents)] : []),
    ...(a.commercialRents ? [...sectionHeaderArr('Commercial rents (AI agent)'), ...commercialRentsAgentSection(a.commercialRents)] : []),
    ...(a.constructionCost ? [...sectionHeaderArr('Construction cost estimate (AI agent)'), ...constructionCostAgentSection(a.constructionCost)] : []),
  ];
  const sections = [
    {
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [
        ...coverPage(report),
        ...riskBanner(report),
        sectionHeader('Executive summary'),
        ...analystSummary(report),
        sectionHeader('Ownership & legal'),
        ...ownershipTable(report),
        ...legalSection(report),
        sectionHeader('Price history'),
        ...priceHistorySection(report),
        sectionHeader('Planning constraints'),
        ...planningSection(report),
        ...planningApplicationsSection(report),
        sectionHeader('Flood risk'),
        ...floodSection(report),
        sectionHeader('Energy performance (EPC)'),
        ...epcSection(report),
        sectionHeader('Ground & environmental'),
        ...groundSection(report),
        sectionHeader('Market context'),
        ...marketSection(report),
        sectionHeader('Risk flags'),
        ...flagsSection(report),
        sectionHeader('Recommended next steps'),
        ...nextStepsSection(report),
        ...(agentBlocks.length
          ? [new Paragraph({ children: [new PageBreak()] }), ...agentBlocks]
          : []),
        ...(memoBlocks.length
          ? [new Paragraph({ children: [new PageBreak()] }), ...memoBlocks]
          : []),
        ...disclaimer(),
      ],
    },
  ];

  const doc = new Document({
    creator: 'PropertyIQ',
    title: `PropertyIQ Deal Risk Report — ${report.queryInput || 'Property'}`,
    description: 'AI-assisted UK property due diligence report',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections,
  });

  return await Packer.toBuffer(doc);
}

export async function buildCompanyDocx(report, _rawData, { agentResults } = {}) {
  const a = agentResults || {};
  const agentBlocks = [
    ...(a.adverseMedia ? [...sectionHeaderArr('Adverse media screening (AI agent)'), ...adverseMediaAgentSection(a.adverseMedia)] : []),
    ...(a.corporateProperties ? [...sectionHeaderArr('Corporate property holdings (AI agent)'), ...corporatePropertiesAgentSection(a.corporateProperties)] : []),
    ...(a.vatLookup ? [...sectionHeaderArr('VAT lookup (AI agent)'), ...vatLookupAgentSection(a.vatLookup)] : []),
  ];
  const sections = [
    {
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [
        ...coverPage(report),
        ...riskBanner(report),
        sectionHeader('Executive summary'),
        ...analystSummary(report),
        sectionHeader('Company profile'),
        ...companyProfileSection(report),
        sectionHeader('Ownership structure'),
        ...ownershipStructureSection(report),
        sectionHeader('Directors & officers'),
        ...directorsSection(report),
        sectionHeader('Financial health'),
        ...financialHealthSection(report),
        sectionHeader('VAT status'),
        ...vatSection(report),
        sectionHeader('Risk flags'),
        ...flagsSection(report),
        sectionHeader('Recommended due diligence'),
        ...nextStepsSection(report),
        ...(agentBlocks.length
          ? [new Paragraph({ children: [new PageBreak()] }), ...agentBlocks]
          : []),
        ...disclaimer(),
      ],
    },
  ];

  const doc = new Document({
    creator: 'PropertyIQ',
    title: `PropertyIQ JV Risk Report — ${report.queryInput || 'Company'}`,
    description: 'AI-assisted UK company / JV partner due diligence report',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections,
  });

  return await Packer.toBuffer(doc);
}

// ── building blocks ──────────────────────────────────────────────────────────

function coverPage(report) {
  return [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({ text: 'PropertyIQ', bold: true, size: 32, color: COLOR_CLAUDE }),
        new TextRun({ text: '   ', size: 32 }),
        new TextRun({
          text: report.reportType === 'company' ? 'JV Partner Risk Report' : 'Deal Risk Report',
          size: 24,
          color: COLOR_INK,
        }),
      ],
    }),
    new Paragraph({
      spacing: { before: 120, after: 60 },
      children: [
        new TextRun({ text: report.queryInput || 'Property', bold: true, size: 36, color: COLOR_INK }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated ${
            report.generatedAt ? new Date(report.generatedAt).toLocaleString('en-GB') : 'today'
          }   ·   Data completeness: ${report.dataQuality?.dataCompleteness || 'Medium'}`,
          color: COLOR_MUTED,
          size: 18,
        }),
      ],
    }),
    spacer(),
  ];
}

function riskBanner(report) {
  const level = (report.riskLevel || 'medium').toUpperCase();
  const color =
    level === 'CRITICAL' || level === 'HIGH'
      ? COLOR_CRIT
      : level === 'MEDIUM'
      ? COLOR_WARN
      : COLOR_OK;

  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders(),
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_BG_CREAM },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `Risk score: ${Number(report.riskScore || 0).toFixed(1)} / 10`,
                      bold: true,
                      size: 32,
                      color,
                    }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 60 },
                  children: [
                    new TextRun({ text: `Level: ${level}`, bold: true, color, size: 22 }),
                  ],
                }),
                new Paragraph({
                  spacing: { before: 60 },
                  children: [
                    new TextRun({
                      text: report.riskSummary || 'No risk summary available.',
                      color: COLOR_INK,
                      size: 22,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    spacer(),
  ];
}

function analystSummary(report) {
  return [
    paragraph(report.aiSummary || '(no summary)', { size: 22 }),
    ...(report.keyRisks?.length
      ? [
          subHeader('Key risks'),
          ...report.keyRisks.map((r) => bullet(r)),
        ]
      : []),
    ...(report.keyOpportunities?.length
      ? [
          subHeader('Key opportunities'),
          ...report.keyOpportunities.map((r) => bullet(r)),
        ]
      : report.keyPositives?.length
      ? [
          subHeader('Key positives'),
          ...report.keyPositives.map((r) => bullet(r)),
        ]
      : []),
    spacer(),
  ];
}

function ownershipTable(report) {
  const t = report.titleData || {};
  return [
    keyValueTable([
      ['Owner', t.owner],
      ['Owner type', t.ownerType],
      ['Owner correspondence address', t.ownerAddress],
      ['Title number', t.titleNumber],
      ['Tenure', t.tenure],
      ['Lease years remaining', t.leaseYearsRemaining],
      ['Last registration date', t.lastRegistrationDate],
      ['Data source', t.dataSource],
    ]),
    spacer(),
  ];
}

function legalSection(report) {
  const t = report.titleData || {};
  return [
    subHeader('Mortgages / charges'),
    ...((t.mortgages || []).length ? t.mortgages.map(bullet) : [paragraph('None recorded', { italic: true, color: COLOR_MUTED })]),
    subHeader('Restrictive covenants'),
    ...((t.restrictiveCovenants || []).length
      ? t.restrictiveCovenants.map(bullet)
      : [paragraph('None recorded', { italic: true, color: COLOR_MUTED })]),
    subHeader('Easements'),
    ...((t.easements || []).length ? t.easements.map(bullet) : [paragraph('None recorded', { italic: true, color: COLOR_MUTED })]),
    spacer(),
  ];
}

function priceHistorySection(report) {
  const rows = (report.priceHistory || []).slice().sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
  return [
    keyValueTable([
      ['Last sale price', formatGBP(report.lastSalePrice)],
      ['Last sale date', report.lastSaleDate],
      ['1-year growth', report.priceGrowth1yr],
      ['5-year growth', report.priceGrowth5yr],
      ['10-year growth', report.priceGrowth10yr],
      ['All-time growth', report.priceGrowthAllTime],
      ['Years covered', report.yearsCovered],
    ]),
    subHeader('All recorded transactions'),
    ...(rows.length
      ? [
          dataTable(
            ['Date', 'Price', 'Property type', 'Tenure'],
            rows.map((r) => [
              r.date || '—',
              formatGBP(r.price),
              r.propertyType || '—',
              r.tenure || '—',
            ]),
          ),
        ]
      : [paragraph('No transaction history recorded.', { italic: true, color: COLOR_MUTED })]),
    spacer(),
  ];
}

function planningSection(report) {
  const p = report.planningConstraints || {};
  const rows = [
    ['Local Planning Authority', p.localPlanningAuthority],
    ['Conservation Area', formatBoolWithDetail(p.conservationArea?.present, p.conservationArea?.name)],
    [
      'Listed Building',
      formatBoolWithDetail(p.listedBuilding?.present, p.listedBuilding?.grade ? `Grade ${p.listedBuilding.grade}` : null),
    ],
    ['Green Belt', formatBool(p.greenBelt)],
    ['Article 4 Direction', formatBoolWithDetail(p.articleFourDirection?.present, p.articleFourDirection?.description)],
    ['Tree Preservation Order', formatBool(p.treePreservationOrder)],
    ['Brownfield Land', formatBool(p.brownfieldLand)],
    ['National Park', formatBoolWithDetail(p.nationalPark?.present, p.nationalPark?.name)],
    ['AONB', formatBoolWithDetail(p.aonb?.present, p.aonb?.name)],
    ['Ancient Woodland', formatBool(p.ancientWoodland)],
    ['Scheduled Monument', formatBool(p.scheduledMonument)],
    ['World Heritage Site', formatBool(p.worldHeritageSite)],
  ];
  const blocks = [keyValueTable(rows)];
  if (p.planningNotes) blocks.push(paragraph(p.planningNotes, { italic: true, color: COLOR_MUTED }));
  blocks.push(spacer());
  return blocks;
}

function planningApplicationsSection(report) {
  const apps = report.planningApplications || [];
  if (apps.length === 0) return [];
  return [
    subHeader(
      `Recent planning applications nearby (${apps.length}${
        report.planningApplicationsTotal > apps.length ? ` of ${report.planningApplicationsTotal}` : ''
      })`,
    ),
    dataTable(
      ['Reference', 'Date', 'Address', 'Description', 'Status'],
      apps.map((a) => [
        a.reference || '—',
        a.receivedDate ? new Date(a.receivedDate).toLocaleDateString('en-GB') : '—',
        a.address || '—',
        a.description || '—',
        a.status || '—',
      ]),
    ),
    spacer(),
  ];
}

function floodSection(report) {
  const f = report.floodRisk || {};
  return [
    keyValueTable([
      ['Rivers & sea', f.riverAndSea],
      ['Surface water', f.surfaceWater],
      ['Groundwater', f.groundwater],
      ['Reservoir flood extent', f.reservoirRisk ? 'Within modelled extent' : 'Not flagged'],
      ['Insurance implication', f.floodInsuranceImplication],
    ]),
    spacer(),
  ];
}

function epcSection(report) {
  const e = report.epcData || {};
  return [
    keyValueTable([
      ['Current rating', e.currentRating],
      ['Current score', e.currentScore],
      ['Potential rating', e.potentialRating],
      ['Potential score', e.potentialScore],
      ['Lodgement date', e.lodgedDate || e.lodgementDate],
      ['Property type', e.propertyType],
      ['Built form', e.builtForm],
      ['Total floor area (m²)', e.totalFloorArea],
      ['Main heating', e.mainHeating],
      ['Matched address', e.address],
    ]),
    ...((e.keyRecommendations || []).length
      ? [subHeader('Notes & recommendations'), ...e.keyRecommendations.map(bullet)]
      : []),
    spacer(),
  ];
}

function groundSection(report) {
  const g = report.groundRisk || {};
  return [
    keyValueTable([
      ['Stability rating', g.stabilityRating],
      ['Radon band', g.radonBand],
      ['Mining risk', g.miningRisk ? 'Possible' : 'Not flagged'],
    ]),
    ...((g.hazardTypes || []).length
      ? [subHeader('Hazard types'), ...g.hazardTypes.map(bullet)]
      : []),
    ...((g.links || []).length
      ? [
          subHeader('Authoritative sources'),
          ...g.links
            .filter(Boolean)
            .map((l) =>
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  hyperlink(l.name, l.url),
                  new TextRun({ text: ` — ${l.note || ''}`, color: COLOR_MUTED, size: 18 }),
                ],
              }),
            ),
        ]
      : []),
    spacer(),
  ];
}

function marketSection(report) {
  const m = report.marketContext || {};
  return [
    keyValueTable([
      ['Local Authority', m.localAuthority],
      ['Deprivation decile (IMD 2019)', m.deprivationDecile],
      ['Deprivation context', m.deprivationContext],
      ['Average household income', m.avgHouseholdIncome],
      ['Population trend', m.populationGrowthTrend],
      ['Employment rate', m.employmentRate],
      ['Average rental yield', m.avgRentalYield],
      ['Average rent', m.avgRent],
      ['Demand rating', m.demandRating],
      ['UK rental price index', m.ukRentalIndex?.value ? `${m.ukRentalIndex.value} (${m.ukRentalIndex.time})` : null],
    ]),
    spacer(),
  ];
}

function flagsSection(report) {
  const flags = (report.flags || []).slice().sort(
    (a, b) =>
      ['critical', 'warning', 'ok'].indexOf(a.severity) -
      ['critical', 'warning', 'ok'].indexOf(b.severity),
  );
  if (flags.length === 0) return [paragraph('No flags raised.', { italic: true, color: COLOR_MUTED }), spacer()];
  return [
    ...flags.map(
      (f) =>
        new Paragraph({
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: `[${(f.severity || 'warning').toUpperCase()}] `,
              bold: true,
              color: SEVERITY_COLORS[f.severity] || COLOR_WARN,
            }),
            new TextRun({ text: f.title || '(no title)', bold: true, color: COLOR_INK }),
            new TextRun({ text: `   (${f.category || 'other'})`, color: COLOR_MUTED, size: 18 }),
            new TextRun({ text: '\n', break: 1 }),
            new TextRun({ text: f.detail || '', color: COLOR_INK, size: 20 }),
          ],
        }),
    ),
    spacer(),
  ];
}

function nextStepsSection(report) {
  const steps = report.recommendedNextSteps || report.recommendedDueDiligence || [];
  if (steps.length === 0) return [paragraph('No next steps generated.', { italic: true, color: COLOR_MUTED }), spacer()];
  return [
    ...steps.map(
      (s, i) =>
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({ text: `${i + 1}. `, bold: true, color: COLOR_CLAUDE_700 }),
            new TextRun({ text: s, color: COLOR_INK }),
          ],
        }),
    ),
    spacer(),
  ];
}

function companyProfileSection(report) {
  const c = report.companyProfile || {};
  return [
    keyValueTable([
      ['Official name', c.officialName],
      ['Company number', c.companyNumber],
      ['Type', c.companyType],
      ['Status', c.status],
      ['Incorporated', c.incorporatedDate],
      ['Trading age', c.tradingAge],
      ['Registered address', c.registeredAddress],
    ]),
    ...((c.sicCodes || []).length
      ? [
          subHeader('SIC codes'),
          dataTable(
            ['Code', 'Description'],
            c.sicCodes.map((s) => [s.code || '—', s.description || '—']),
          ),
        ]
      : []),
    spacer(),
  ];
}

function ownershipStructureSection(report) {
  const o = report.ownership || {};
  const psc = o.personsOfSignificantControl || [];
  return [
    keyValueTable([['Ownership structure risk', o.ownershipStructureRisk]]),
    ...(psc.length
      ? [
          subHeader('Persons of Significant Control'),
          dataTable(
            ['Name', 'Type', 'Ownership', 'Nationality', 'Country of residence', 'Nature of control'],
            psc.map((p) => [
              p.name || '—',
              p.type || '—',
              p.ownershipBand || '—',
              p.nationality || '—',
              p.countryOfResidence || '—',
              (p.natureOfControl || []).join(', ') || '—',
            ]),
          ),
        ]
      : [paragraph('No PSC records found.', { italic: true, color: COLOR_MUTED })]),
    spacer(),
  ];
}

function directorsSection(report) {
  const directors = report.directors || [];
  if (directors.length === 0) return [paragraph('No officer records.', { italic: true, color: COLOR_MUTED }), spacer()];
  return [
    dataTable(
      ['Name', 'Role', 'Appointed', 'Resigned', 'Nationality', 'Status'],
      directors.map((d) => [
        d.name || '—',
        d.role || '—',
        d.appointedDate || '—',
        d.resignedDate || '—',
        d.nationality || '—',
        d.status || '—',
      ]),
    ),
    spacer(),
  ];
}

function financialHealthSection(report) {
  const f = report.financialHealth || {};
  return [
    keyValueTable([
      ['Last accounts', f.lastAccountsDate],
      ['Accounts filed on time', f.accountsFiledOnTime == null ? 'Unknown' : f.accountsFiledOnTime ? 'Yes' : 'Late'],
      ['Accounts type', f.accountsType],
      ['Next accounts due', f.nextAccountsDue],
      ['Confirmation statement due', f.confirmationStatementDue],
      ['Confirmation overdue', f.confirmationStatementOverdue ? 'Yes' : 'No'],
      ['Charges total', f.chargesTotal],
      ['Charges outstanding', f.chargesOutstanding],
      ['Insolvency history', f.insolvencyHistory ? 'Yes' : 'No'],
      ['Insolvency details', f.insolvencyDetails],
    ]),
    ...((f.chargesDetails || []).length
      ? [
          subHeader('Charges'),
          dataTable(
            ['Lender', 'Status', 'Created'],
            f.chargesDetails.map((c) => [c.lender || '—', c.status || '—', c.created || '—']),
          ),
        ]
      : []),
    spacer(),
  ];
}

function vatSection(report) {
  const v = report.vatStatus || {};
  return [
    keyValueTable([
      ['Registered', v.vatRegistered == null ? 'Unknown' : v.vatRegistered ? 'Yes' : 'No'],
      ['VAT number', v.vatNumber],
      ['Status', v.vatStatus],
      ['Registered name', v.vatRegisteredName],
      ['Address', v.vatAddress],
    ]),
    spacer(),
  ];
}

// Dump the entire raw API responses so the user can see every field.
function disclaimer() {
  return [
    new Paragraph({
      spacing: { before: 240 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } },
      children: [
        new TextRun({ text: 'Data sources: ', bold: true, color: COLOR_MUTED, size: 16 }),
        new TextRun({
          text:
            'HM Land Registry · Companies House · planning.data.gov.uk · Environment Agency · ' +
            'Postcodes.io · ONS · MHCLG EPC service · UKHSA · BGS · Mining Remediation Authority · PlanIt UK.',
          color: COLOR_MUTED,
          size: 16,
        }),
      ],
    }),
    paragraph(
      'Generated by PropertyIQ. This report is informational only and is not a substitute for legal advice or formal due diligence.',
      { italic: true, color: COLOR_MUTED, size: 16 },
    ),
  ];
}

// ── primitive helpers ────────────────────────────────────────────────────────

function sectionHeader(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [
      new TextRun({ text, bold: true, size: 28, color: COLOR_CLAUDE_700 }),
    ],
  });
}

// Array form so spreading is consistent with the per-section helpers.
function sectionHeaderArr(text) {
  return [sectionHeader(text)];
}

// ── AI agent renderers ───────────────────────────────────────────────────────
// Each renderer takes the JSON returned by an agent and produces a list of
// docx Paragraph / Table blocks. Sections are only included when the user
// has actually run the agent (Report.jsx state).

function agentCaveat(text) {
  return paragraph(text, { italic: true, color: COLOR_MUTED, size: 18 });
}

function comparablesAgentSection(d) {
  const blocks = [];
  if (d?.summary) blocks.push(paragraph(d.summary));
  if (d?.askingRentRange?.midpoint) {
    blocks.push(
      paragraph(
        `Asking rent range: ${formatGBP(d.askingRentRange.low)} – ${formatGBP(d.askingRentRange.high)} (mid ${formatGBP(d.askingRentRange.midpoint)})/mo`,
        { bold: true },
      ),
    );
  }
  if (d?.estimatedGrossYieldPct) {
    blocks.push(
      paragraph(
        `Estimated gross yield: ${d.estimatedGrossYieldPct.low}% – ${d.estimatedGrossYieldPct.high}%`,
      ),
    );
  }
  const list = d?.comparables || [];
  if (list.length) {
    blocks.push(subHeader(`Comparable listings (${list.length})`));
    for (const c of list.slice(0, 12)) {
      blocks.push(
        paragraph(
          `${c.address || '—'} — ${formatGBP(c.askingRent)}${c.bedrooms ? ` · ${c.bedrooms}-bed` : ''}${c.propertyType ? ` · ${c.propertyType}` : ''}${c.source ? ` · ${c.source}` : ''}`,
        ),
      );
    }
  }
  blocks.push(agentCaveat('AI-derived from public listings — asking rents only, verify against original source.'));
  return blocks;
}

function avmAgentSection(d) {
  const blocks = [];
  const v = d?.valuation || {};
  if (v.midPointEstimate || v.askingPriceLow) {
    blocks.push(
      paragraph(
        `Mid-point estimate: ${formatGBP(v.midPointEstimate)} · Asking range ${formatGBP(v.askingPriceLow)}–${formatGBP(v.askingPriceHigh)} · Likely achieved ${formatGBP(v.achievedPriceEstimateLow)}–${formatGBP(v.achievedPriceEstimateHigh)}`,
        { bold: true },
      ),
    );
  }
  if (v.pricePerSqFtLow || v.pricePerSqFtHigh) {
    blocks.push(paragraph(`£/sqft range: £${v.pricePerSqFtLow ?? '?'} – £${v.pricePerSqFtHigh ?? '?'} · Confidence: ${d.confidence || 'unstated'}`));
  }
  const list = d?.comparables || [];
  if (list.length) {
    blocks.push(subHeader(`Comparable sale listings (${list.length})`));
    for (const c of list.slice(0, 12)) {
      blocks.push(
        paragraph(
          `${c.address || '—'} — ${formatGBP(c.askingPrice)}${c.bedrooms ? ` · ${c.bedrooms}-bed` : ''}${c.floorAreaSqM ? ` · ${c.floorAreaSqM} m²` : ''}${c.pricePerSqFt ? ` · £${c.pricePerSqFt}/sqft` : ''}${c.source ? ` · ${c.source}` : ''}`,
        ),
      );
    }
  }
  blocks.push(agentCaveat('Asking-price evidence — not a regulated lender-grade AVM.'));
  return blocks;
}

function hmoRentsAgentSection(d) {
  if (!d?.found) {
    return [paragraph(d?.summary || 'No HMO rent evidence found nearby.')];
  }
  const blocks = [];
  if (d.perRoomRentRange) {
    blocks.push(
      paragraph(
        `Per-room rent: ${formatGBP(d.perRoomRentRange.low)}–${formatGBP(d.perRoomRentRange.high)}/mo (mid ${formatGBP(d.perRoomRentRange.midpoint)})`,
        { bold: true },
      ),
    );
  }
  if (d.estimatedHmoIncome) {
    const fb = d.estimatedHmoIncome.fiveBed;
    const sb = d.estimatedHmoIncome.sixBed;
    if (fb) blocks.push(paragraph(`5-bed HMO income: ${formatGBP(fb.annual)}/yr (${formatGBP(fb.monthly)}/mo)`));
    if (sb) blocks.push(paragraph(`6-bed HMO income: ${formatGBP(sb.annual)}/yr (${formatGBP(sb.monthly)}/mo)`));
  }
  if (d.estimatedGrossYieldPct) {
    const fb = d.estimatedGrossYieldPct.fiveBed;
    const sb = d.estimatedGrossYieldPct.sixBed;
    if (fb) blocks.push(paragraph(`5-bed gross yield: ${fb.low}% – ${fb.high}%`));
    if (sb) blocks.push(paragraph(`6-bed gross yield: ${sb.low}% – ${sb.high}%`));
  }
  if (d.licensingAndArticle4) blocks.push(paragraph(`Licensing / Article 4: ${d.licensingAndArticle4}`, { italic: true }));
  const rooms = d?.rooms || [];
  if (rooms.length) {
    blocks.push(subHeader(`Sample room listings (${rooms.length})`));
    for (const r of rooms.slice(0, 10)) {
      blocks.push(
        paragraph(
          `${r.address || '—'} — ${formatGBP(r.monthlyRent)}/mo${r.roomType ? ` · ${r.roomType}` : ''}${r.billsIncluded ? ' · bills inc' : ''}${r.source ? ` · ${r.source}` : ''}`,
        ),
      );
    }
  }
  blocks.push(agentCaveat('Per-room rents from public listings — assumes full occupancy. Article 4 + LA HMO licensing rules apply.'));
  return blocks;
}

function commercialRentsAgentSection(d) {
  if (!d?.found || !(d?.byAssetClass || []).length) {
    return [paragraph(d?.summary || 'No commercial comparables found nearby.')];
  }
  const blocks = [paragraph(d.summary || '')];
  for (const c of d.byAssetClass) {
    blocks.push(subHeader(c.assetClass || 'Asset class'));
    if (c.rentRangePerSqFt) {
      blocks.push(paragraph(`Rent £/sqft: £${c.rentRangePerSqFt.low ?? '?'} – £${c.rentRangePerSqFt.high ?? '?'}${c.rentRangePerSqFt.midpoint ? ` (mid £${c.rentRangePerSqFt.midpoint})` : ''}`));
    }
    if (c.typicalYieldPct) {
      blocks.push(paragraph(`Yield range: ${c.typicalYieldPct.low ?? '?'}% – ${c.typicalYieldPct.high ?? '?'}%`));
    }
    if (c.evidenceNote) blocks.push(paragraph(c.evidenceNote, { italic: true }));
    for (const cmp of (c.comparables || []).slice(0, 5)) {
      blocks.push(
        paragraph(
          `${cmp.address || '—'} — ${cmp.askingRent || '—'}${cmp.size ? ` · ${cmp.size}` : ''}${cmp.leaseTerm ? ` · ${cmp.leaseTerm}` : ''}${cmp.source ? ` · ${cmp.source}` : ''}`,
        ),
      );
    }
  }
  blocks.push(agentCaveat('Asking rents only. CoStar / Realla paid services have transacted rents and are more authoritative for institutional work.'));
  return blocks;
}

function constructionCostAgentSection(d) {
  const blocks = [];
  if (d?.location) blocks.push(paragraph(`Region: ${d.location}`));
  for (const e of d?.estimates || []) {
    blocks.push(subHeader(e.scope || 'Estimate'));
    if (e.ratePerSqM) {
      blocks.push(paragraph(`£/m²: £${e.ratePerSqM.low ?? '?'} – £${e.ratePerSqM.high ?? '?'}${e.ratePerSqM.midpoint ? ` (mid £${e.ratePerSqM.midpoint})` : ''}`));
    }
    if (e.ratePerSqFt) {
      blocks.push(paragraph(`£/sqft: £${e.ratePerSqFt.low ?? '?'} – £${e.ratePerSqFt.high ?? '?'}${e.ratePerSqFt.midpoint ? ` (mid £${e.ratePerSqFt.midpoint})` : ''}`));
    }
    if (e.notes) blocks.push(paragraph(e.notes));
    for (const s of e.sourcesCited || []) {
      blocks.push(paragraph(`Source: ${s.name}${s.publishedDate ? ` (${s.publishedDate})` : ''}${s.url ? ` — ${s.url}` : ''}`, { color: COLOR_MUTED, size: 18 }));
    }
  }
  if (d?.professionalFees) blocks.push(paragraph(`Professional fees: ${d.professionalFees}`));
  if (d?.contingency) blocks.push(paragraph(`Contingency: ${d.contingency}`));
  blocks.push(agentCaveat('Indicative. Not a substitute for project-specific QS cost planning.'));
  return blocks;
}

function adverseMediaAgentSection(d) {
  const blocks = [];
  if (d?.overallVerdict) blocks.push(paragraph(`Overall verdict: ${d.overallVerdict}`, { bold: true }));
  if (d?.summary) blocks.push(paragraph(d.summary));
  const counts = [];
  if (d?.criticalCount) counts.push(`${d.criticalCount} critical`);
  if (d?.warningCount) counts.push(`${d.warningCount} warning`);
  if (d?.informationalCount) counts.push(`${d.informationalCount} informational`);
  if (counts.length) blocks.push(paragraph(counts.join(' · ')));
  for (const f of d?.findings || []) {
    blocks.push(subHeader(`[${(f.severity || 'info').toUpperCase()}] ${f.headline || ''}`));
    if (f.detail) blocks.push(paragraph(f.detail));
    blocks.push(paragraph(`${f.source || ''}${f.date ? ` · ${f.date}` : ''}${f.verified ? ' · ✓ Verified' : ' · Unverified'}${f.sourceUrl ? ` — ${f.sourceUrl}` : ''}`, { color: COLOR_MUTED, size: 18 }));
  }
  blocks.push(agentCaveat('Limited to publicly indexed news. Verify each finding against the original source.'));
  return blocks;
}

function corporatePropertiesAgentSection(d) {
  if (!d?.found) {
    return [paragraph(d?.summary || 'No specific properties evidenced.')];
  }
  const blocks = [paragraph(`${d.totalFound || (d.properties || []).length} properties evidenced`, { bold: true })];
  if (d.summary) blocks.push(paragraph(d.summary));
  for (const p of d.properties || []) {
    blocks.push(subHeader(p.address || 'Property'));
    blocks.push(
      paragraph(
        `${p.relationship || ''}${p.type ? ` · ${p.type}` : ''}${p.town ? ` · ${p.town}` : ''}${p.postcode ? ` · ${p.postcode}` : ''}${p.yearAcquired ? ` · acquired ${p.yearAcquired}` : ''}${p.yearDisposed ? ` · disposed ${p.yearDisposed}` : ''}${p.value ? ` · ${p.value}` : ''}`,
      ),
    );
    if (p.evidenceQuote) blocks.push(paragraph(`"${p.evidenceQuote}"`, { italic: true }));
    if (p.source) blocks.push(paragraph(`Source: ${p.source}${p.sourceUrl ? ` — ${p.sourceUrl}` : ''}`, { color: COLOR_MUTED, size: 18 }));
  }
  blocks.push(agentCaveat('Web-derived evidence only — surfaces the most-publicised holdings, not every title.'));
  return blocks;
}

function vatLookupAgentSection(d) {
  if (!d?.found) {
    return [paragraph(d?.explanation || 'VAT number not found.')];
  }
  const blocks = [
    paragraph(`VAT number: ${d.vatNumber || '—'}`, { bold: true }),
    paragraph(`Status: ${d.verifiedActive ? '✓ Verified active' : 'Found, not verified active'}`),
  ];
  if (d.vatRegisteredName) blocks.push(paragraph(`Registered name: ${d.vatRegisteredName}`));
  if (d.vatAddress) blocks.push(paragraph(`Registered address: ${d.vatAddress}`));
  if (d.explanation) blocks.push(paragraph(d.explanation));
  for (const s of d.sources || []) {
    blocks.push(paragraph(`Source: ${s.publisher || s.url || ''}${s.url ? ` — ${s.url}` : ''}`, { color: COLOR_MUTED, size: 18 }));
  }
  return blocks;
}

function subHeader(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, color: COLOR_INK })],
  });
}

function paragraph(text, { bold = false, italic = false, color = COLOR_INK, size = 22 } = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: String(text == null ? '' : text), bold, italics: italic, color, size })],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text: String(text), color: COLOR_INK, size: 22 })],
  });
}

function spacer() {
  return new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: '' })] });
}

function keyValueTable(rows) {
  const tableRows = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_BG_CREAM },
            children: [
              new Paragraph({
                children: [new TextRun({ text: String(k), bold: true, color: COLOR_INK, size: 20 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: String(v), color: COLOR_INK, size: 20 })],
              }),
            ],
          }),
        ],
      }),
    );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows.length
      ? tableRows
      : [
          new TableRow({
            children: [
              new TableCell({
                children: [paragraph('No data', { italic: true, color: COLOR_MUTED })],
              }),
            ],
          }),
        ],
    borders: thinBorders(),
  });
}

function dataTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          (h) =>
            new TableCell({
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: COLOR_BG_CREAM },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h, bold: true, color: COLOR_CLAUDE_700, size: 18 })],
                }),
              ],
            }),
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: String(cell ?? ''), color: COLOR_INK, size: 18 })],
                    }),
                  ],
                }),
            ),
          }),
      ),
    ],
    borders: thinBorders(),
  });
}

function hyperlink(text, url) {
  return new ExternalHyperlink({
    link: url,
    children: [
      new TextRun({
        text,
        style: 'Hyperlink',
        color: COLOR_CLAUDE_700,
        underline: {},
        size: 18,
      }),
    ],
  });
}

function thinBorders() {
  const e = { style: BorderStyle.SINGLE, size: 4, color: 'D9D5C8' };
  return { top: e, bottom: e, left: e, right: e, insideHorizontal: e, insideVertical: e };
}

function noBorders() {
  const z = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  return { top: z, bottom: z, left: z, right: z, insideHorizontal: z, insideVertical: z };
}

function formatGBP(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(v);
}

function formatBool(b) {
  return b ? 'Yes' : 'No';
}

function formatBoolWithDetail(b, detail) {
  if (!b) return 'No';
  return detail ? `Yes — ${detail}` : 'Yes';
}

// Render the Claude-drafted Markdown memo as a clean second-page section
// inside the same .docx. Only handles the Markdown subset the memo prompt
// emits (#, ##, bullet `- `, numbered `1.`, plain paragraphs).
function memoSection(memoMarkdown) {
  const lines = String(memoMarkdown).split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      out.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
      continue;
    }
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      out.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: h1[1], bold: true, size: 32, color: COLOR_CLAUDE_700 })],
        }),
      );
      continue;
    }
    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      out.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 80 },
          children: [new TextRun({ text: h2[1], bold: true, size: 26, color: COLOR_INK })],
        }),
      );
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      out.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInline(bullet[1]),
        }),
      );
      continue;
    }
    const num = line.match(/^(\d+\.)\s+(.*)$/);
    if (num) {
      out.push(
        new Paragraph({
          spacing: { after: 80 },
          indent: { left: 360, hanging: 360 },
          children: [
            new TextRun({ text: `${num[1]} `, bold: true }),
            ...parseInline(num[2]),
          ],
        }),
      );
      continue;
    }
    out.push(new Paragraph({ spacing: { after: 120 }, children: parseInline(line) }));
  }
  return out;
}

// Minimal inline Markdown parser — bold (**x**) and italic (*x*).
function parseInline(text) {
  const runs = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2);
      if (end > -1) {
        runs.push(new TextRun({ text: text.slice(i + 2, end), bold: true }));
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end > -1) {
        runs.push(new TextRun({ text: text.slice(i + 1, end), italics: true }));
        i = end + 1;
        continue;
      }
    }
    // Find the next bold/italic marker so we batch plain text in one run.
    let nextSpecial = text.length;
    const candidates = [text.indexOf('**', i), text.indexOf('*', i)].filter((x) => x > -1);
    if (candidates.length) nextSpecial = Math.min(...candidates);
    runs.push(new TextRun({ text: text.slice(i, nextSpecial) }));
    i = nextSpecial;
  }
  return runs.length ? runs : [new TextRun({ text })];
}
