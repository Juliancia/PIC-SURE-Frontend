import type { Data, Layout, UpdateMenu } from 'plotly.js-basic-dist-min';
import type { Indexable } from '$lib/types';
import type { Column } from '$lib/components/datatable/types';
import type { PlotValues } from '$lib/utilities/Plotly';

// Column names written by HPDS (VCF excerpt) and by our VCF annotation (VEP + gnomAD)
export const VariantColumn = {
  Chromosome: 'CHROM',
  Position: 'POSITION',
  Ref: 'REF',
  Alt: 'ALT',
  Gene: 'Gene_with_variant',
  Consequence: 'Variant_consequence_calculated',
  Severity: 'Variant_severity',
  GnomadFrequency: 'Variant_frequency_in_gnomAD',
  InSubset: 'Patients with this variant in subset',
  NotInSubset: 'Patients with this variant NOT in subset',
} as const;

export const SEVERITIES = ['HIGH', 'MODERATE', 'LOW', 'MODIFIER', 'Unknown'] as const;
export type Severity = (typeof SEVERITIES)[number];

const SEVERITY_COLORS: Record<Severity, string> = {
  HIGH: '#c31f3f',
  MODERATE: '#FF6E1E',
  LOW: '#E8B400',
  MODIFIER: '#9AA0A6',
  Unknown: '#616265',
};

const FONT = { family: 'Nunito Sans, sans-serif' };

// One tick per power of ten, written as a plain decimal (0.001 rather than 1m or 10⁻³)
const LOG_AXIS = { type: 'log', dtick: 1, tickformat: '~g', automargin: true } as const;

export type ChartVariant = {
  id: string;
  chromosome: string;
  position: number;
  genes: string[];
  consequences: string[];
  severity: Severity;
  gnomadFrequency: number | null;
  carriers: number;
  subsetSize: number;
  // Allele frequency from genotypes (full export only)
  cohortAlleleFrequency: number | null;
};

// HPDS joins multiple values with "," and writes "null" when a variant has no value
function splitValues(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v && v !== 'null');
}

// The most severe of possibly several values
function toSeverity(value: unknown): Severity {
  const values = splitValues(value);
  return SEVERITIES.find((severity) => values.includes(severity)) ?? 'Unknown';
}

// "k/n" -> carriers k out of n patients in the cohort
export function parseCarriers(value: unknown): { carriers: number; total: number } | null {
  const match = /^(\d+)\/(\d+)$/.exec(String(value ?? '').trim());
  return match ? { carriers: Number(match[1]), total: Number(match[2]) } : null;
}

// In a full export every column after "NOT in subset" is one cohort patient's genotype
function genotypeColumns(columns: Column[]): string[] {
  const names = columns.map((column) => column.dataElement);
  const start = names.indexOf(VariantColumn.NotInSubset);
  return start < 0 ? [] : names.slice(start + 1);
}

function alleleFrequency(row: Indexable, patients: string[]): number | null {
  if (!patients.length) return null;
  let alleles = 0;
  for (const patient of patients) {
    const genotype = String(row[patient] ?? '');
    if (genotype === '0/1') alleles += 1;
    else if (genotype === '1/1') alleles += 2;
  }
  return alleles / (2 * patients.length);
}

export function toChartVariants(rows: Indexable[], columns: Column[]): ChartVariant[] {
  const patients = genotypeColumns(columns);
  return rows.map((row) => {
    const counts = parseCarriers(row[VariantColumn.InSubset]);
    const gnomad = Number.parseFloat(String(row[VariantColumn.GnomadFrequency]));
    return {
      id: `${row[VariantColumn.Chromosome]}:${row[VariantColumn.Position]} ${row[VariantColumn.Ref]}>${row[VariantColumn.Alt]}`,
      chromosome: String(row[VariantColumn.Chromosome] ?? ''),
      position: Number(row[VariantColumn.Position]),
      genes: splitValues(row[VariantColumn.Gene]),
      consequences: splitValues(row[VariantColumn.Consequence]),
      severity: toSeverity(row[VariantColumn.Severity]),
      gnomadFrequency: Number.isFinite(gnomad) && gnomad > 0 ? gnomad : null,
      carriers: counts?.carriers ?? 0,
      subsetSize: counts?.total ?? 0,
      cohortAlleleFrequency: alleleFrequency(row, patients),
    };
  });
}

// Genes ordered by number of variants, most first
export function genesByVariantCount(variants: ChartVariant[]): string[] {
  const counts = new Map<string, number>();
  variants.forEach((variant) =>
    variant.genes.forEach((gene) => counts.set(gene, (counts.get(gene) ?? 0) + 1)),
  );
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([gene]) => gene);
}

function hoverText(variant: ChartVariant) {
  const gnomad =
    variant.gnomadFrequency === null ? 'not in gnomAD' : variant.gnomadFrequency.toPrecision(3);
  return [
    `<b>${variant.id}</b>`,
    `Gene: ${variant.genes.join(', ') || '-'}`,
    `Consequence: ${variant.consequences.join(', ') || '-'}`,
    `Severity: ${variant.severity}`,
    `gnomAD frequency: ${gnomad}`,
    `Carriers in cohort: ${variant.carriers}/${variant.subsetSize}`,
  ].join('<br>');
}

function dropdown(x: number, active: number, buttons: Partial<UpdateMenu>['buttons']) {
  return {
    type: 'dropdown',
    x,
    xanchor: 'left',
    y: 1.02,
    yanchor: 'bottom',
    active,
    showactive: true,
    buttons,
  } as Partial<UpdateMenu>;
}

function scaleMenu(x: number) {
  return dropdown(x, 0, [
    { label: 'Linear', method: 'relayout', args: [{ 'yaxis.type': 'linear' }] },
    {
      label: 'Log',
      method: 'relayout',
      args: [{ 'yaxis.type': 'log', 'yaxis.autorangeoptions.include': 1 }],
    },
  ]);
}

function severitiesPresent(variants: ChartVariant[]) {
  return SEVERITIES.filter((severity) => variants.some((v) => v.severity === severity));
}

/**
 * Variant consequences, stacked by severity. A variant with several consequences counts once for each.
 */
export function createConsequencePlot(variants: ChartVariant[]): PlotValues {
  const variantTotals = new Map<string, number>();
  variants.forEach((variant) =>
    variant.consequences.forEach((consequence) =>
      variantTotals.set(consequence, (variantTotals.get(consequence) ?? 0) + 1),
    ),
  );
  const consequences = [...variantTotals.keys()].sort(
    (a, b) => (variantTotals.get(b) ?? 0) - (variantTotals.get(a) ?? 0) || a.localeCompare(b),
  );

  const severities = severitiesPresent(variants);
  const countFor = (severity: Severity, consequence: string, carriers: boolean) =>
    variants
      .filter((v) => v.severity === severity && v.consequences.includes(consequence))
      .reduce((sum, v) => sum + (carriers ? v.carriers : 1), 0);
  const variantCounts = severities.map((s) => consequences.map((c) => countFor(s, c, false)));
  const carrierCounts = severities.map((s) => consequences.map((c) => countFor(s, c, true)));

  const data: Data[] = severities.map((severity, i) => ({
    type: 'bar',
    name: severity,
    x: consequences,
    y: variantCounts[i],
    marker: { color: SEVERITY_COLORS[severity] },
    hovertemplate: `%{x}<br>${severity}: %{y}<extra></extra>`,
  }));

  const layout: Partial<Layout> = {
    title: { text: 'Variant consequences' },
    width: 700,
    height: 600,
    barmode: 'stack',
    hovermode: 'closest',
    font: FONT,
    legend: { title: { text: 'Severity' }, traceorder: 'normal' },
    margin: { t: 140 },
    xaxis: { title: { text: 'Consequence (VEP)' }, automargin: true, tickangle: -35 },
    yaxis: { title: { text: 'Number of variants' }, automargin: true },
    updatemenus: [
      dropdown(0, 0, [
        {
          label: 'Variants',
          method: 'update',
          args: [{ y: variantCounts }, { 'yaxis.title.text': 'Number of variants' }],
        },
        {
          label: 'Carriers',
          method: 'update',
          args: [{ y: carrierCounts }, { 'yaxis.title.text': 'Carriers in cohort' }],
        },
      ]),
      scaleMenu(0.22),
    ],
  };

  return { data, layout, meta: { isCategorical: true, unformatedTitle: 'Variant consequences' } };
}

/**
 * Lollipop plot of one gene's variants: genomic position against carriers in the cohort, coloured by severity.
 */
export function createLollipopPlot(variants: ChartVariant[], gene: string): PlotValues {
  const geneVariants = variants
    .filter((v) => v.genes.includes(gene) && Number.isFinite(v.position))
    .sort((a, b) => a.position - b.position);

  // Stems as one line trace, broken by nulls between variants
  const stems: Data = {
    type: 'scatter',
    mode: 'lines',
    x: geneVariants.flatMap((v) => [v.position, v.position, null]),
    y: geneVariants.flatMap((v) => [0, v.carriers, null]),
    line: { color: '#BDBDBD', width: 1 },
    hoverinfo: 'skip',
    showlegend: false,
  };
  const heads: Data[] = severitiesPresent(geneVariants).map((severity) => {
    const subset = geneVariants.filter((v) => v.severity === severity);
    return {
      type: 'scatter',
      mode: 'markers',
      name: severity,
      x: subset.map((v) => v.position),
      y: subset.map((v) => v.carriers),
      text: subset.map(hoverText),
      hovertemplate: '%{text}<extra></extra>',
      marker: { color: SEVERITY_COLORS[severity], size: 10, line: { color: '#FFFFFF', width: 1 } },
    };
  });

  const chromosome = geneVariants[0]?.chromosome;
  const title = `Variants in ${gene}`;
  const layout: Partial<Layout> = {
    title: { text: title },
    width: 700,
    height: 600,
    hovermode: 'closest',
    font: FONT,
    legend: { title: { text: 'Severity' }, traceorder: 'normal' },
    margin: { t: 140 },
    xaxis: {
      title: { text: chromosome ? `Position on chromosome ${chromosome}` : 'Position' },
      automargin: true,
      tickformat: ',d',
    },
    yaxis: { title: { text: 'Carriers in cohort' }, automargin: true, rangemode: 'tozero' },
    updatemenus: [scaleMenu(0)],
  };

  return {
    data: [stems, ...heads],
    layout,
    meta: { isCategorical: false, unformatedTitle: title },
  };
}

export type FrequencyPlotValues = PlotValues & { notInGnomad: number; notInCohort: number };

/**
 * Cohort frequency against gnomAD frequency on log-log axes. Uses allele frequency from genotypes when the export has them,
 * otherwise the share of cohort patients carrying the variant. Variants without a gnomAD frequency, or with no carriers in the
 * cohort, cannot be placed on a log axis and are only counted.
 */
export function createFrequencyPlot(variants: ChartVariant[]): FrequencyPlotValues {
  const hasGenotypes = variants.some((v) => v.cohortAlleleFrequency !== null);
  const cohortFrequency = (v: ChartVariant) =>
    hasGenotypes ? (v.cohortAlleleFrequency ?? 0) : v.subsetSize ? v.carriers / v.subsetSize : 0;

  const placed = variants.filter((v) => v.gnomadFrequency !== null && cohortFrequency(v) > 0);
  const notInGnomad = variants.filter((v) => v.gnomadFrequency === null).length;
  const notInCohort = variants.filter(
    (v) => v.gnomadFrequency !== null && cohortFrequency(v) === 0,
  ).length;

  const yTitle = hasGenotypes
    ? 'Allele frequency in cohort'
    : 'Share of cohort carrying the variant';
  const points: Data[] = severitiesPresent(placed).map((severity) => {
    const subset = placed.filter((v) => v.severity === severity);
    return {
      type: 'scatter',
      mode: 'markers',
      name: severity,
      x: subset.map((v) => v.gnomadFrequency as number),
      y: subset.map(cohortFrequency),
      text: subset.map((v) => `${hoverText(v)}<br>${yTitle}: ${cohortFrequency(v).toPrecision(3)}`),
      hovertemplate: '%{text}<extra></extra>',
      marker: { color: SEVERITY_COLORS[severity], size: 7, opacity: 0.75 },
    };
  });

  const all = placed.flatMap((v) => [v.gnomadFrequency as number, cohortFrequency(v)]);
  const low = all.length ? Math.min(...all) : 1e-4;
  const diagonal: Data = {
    type: 'scatter',
    mode: 'lines',
    name: 'Same as gnomAD',
    x: [low, 1],
    y: [low, 1],
    line: { color: '#616265', dash: 'dash', width: 1 },
    hoverinfo: 'skip',
  };

  const title = 'Cohort frequency vs gnomAD';
  const layout: Partial<Layout> = {
    title: { text: title },
    width: 700,
    height: 600,
    hovermode: 'closest',
    font: FONT,
    legend: { title: { text: 'Severity' }, traceorder: 'normal' },
    xaxis: { title: { text: 'Allele frequency in gnomAD' }, ...LOG_AXIS },
    yaxis: { title: { text: yTitle }, ...LOG_AXIS },
  };

  return {
    data: [diagonal, ...points],
    layout,
    meta: { isCategorical: false, unformatedTitle: title },
    notInGnomad,
    notInCohort,
  };
}
