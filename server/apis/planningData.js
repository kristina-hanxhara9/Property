const BASE_URL = 'https://www.planning.data.gov.uk/entity.json';

const DATASETS = [
  'conservation-area',
  'listed-building',
  'listed-building-outline',
  'green-belt',
  'article-4-direction-area',
  'tree-preservation-zone',
  'tree',
  'brownfield-land',
  'brownfield-site',
  'national-park',
  'area-of-outstanding-natural-beauty',
  'ancient-woodland',
  'scheduled-monument',
  'world-heritage-site',
  'world-heritage-site-buffer-zone',
  'site-of-special-scientific-interest',
  'special-area-of-conservation',
  'special-protection-area',
  'ramsar',
  'flood-risk-zone',
  'archaeological-priority-area',
  'agricultural-land-classification',
  'heritage-coast',
  'local-planning-authority',
];

export async function fetchPlanningConstraints({ latitude, longitude }) {
  if (latitude == null || longitude == null) {
    throw new Error('latitude and longitude required');
  }

  const results = await Promise.allSettled(
    DATASETS.map((dataset) => queryDataset(dataset, latitude, longitude)),
  );

  const grouped = {};
  const errors = [];

  for (let i = 0; i < DATASETS.length; i++) {
    const dataset = DATASETS[i];
    const result = results[i];
    if (result.status === 'fulfilled') {
      grouped[dataset] = result.value;
    } else {
      grouped[dataset] = [];
      errors.push({ dataset, error: result.reason?.message || 'unknown' });
    }
  }

  return {
    constraints: grouped,
    errors,
  };
}

async function queryDataset(dataset, latitude, longitude) {
  const url = new URL(BASE_URL);
  url.searchParams.set('dataset', dataset);
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('limit', '50');

  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Planning Data returned ${res.status} for ${dataset}`);
  }
  const body = await res.json();
  const entities = body?.entities || body?.results || [];

  return entities.map((e) => ({
    name: e.name || e['name-cy'] || e.reference || null,
    reference: e.reference || null,
    dataset: e.dataset || dataset,
    typology: e.typology || null,
    startDate: e['start-date'] || null,
    endDate: e['end-date'] || null,
    organisation: e['organisation-entity'] || null,
    notes: e.notes || null,
    grade: e['listed-building-grade'] || e.grade || null,
  }));
}
