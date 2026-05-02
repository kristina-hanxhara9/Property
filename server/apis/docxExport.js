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

export async function buildPropertyDocx(report, rawData) {
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
        new Paragraph({ children: [new PageBreak()] }),
        sectionHeader('Raw data — all API fields'),
        ...rawDataSection(rawData || {}),
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

export async function buildCompanyDocx(report, rawData) {
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
        new Paragraph({ children: [new PageBreak()] }),
        sectionHeader('Raw data — all API fields'),
        ...rawDataSection(rawData || {}),
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
function rawDataSection(rawData) {
  const blocks = [];
  for (const [key, value] of Object.entries(rawData)) {
    if (value == null) continue;
    blocks.push(subHeader(`Source: ${key}`));
    const pretty = JSON.stringify(value, null, 2);
    // Word handles long pre-formatted blocks fine if we feed line by line.
    for (const line of pretty.split('\n').slice(0, 200)) {
      blocks.push(
        new Paragraph({
          spacing: { after: 0 },
          children: [
            new TextRun({
              text: line || ' ',
              font: 'Consolas',
              size: 16,
              color: COLOR_INK,
            }),
          ],
        }),
      );
    }
    if (pretty.split('\n').length > 200) {
      blocks.push(
        paragraph(`… (${pretty.split('\n').length - 200} more lines truncated)`, {
          italic: true,
          color: COLOR_MUTED,
          size: 16,
        }),
      );
    }
    blocks.push(spacer());
  }
  return blocks;
}

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
