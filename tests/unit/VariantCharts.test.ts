import { describe, it, expect } from 'vitest';
import type { Column } from '$lib/components/datatable/types';
import type { Indexable } from '$lib/types';
import {
  createConsequencePlot,
  createFrequencyPlot,
  createLollipopPlot,
  genesByVariantCount,
  parseCarriers,
  toChartVariants,
} from '$lib/utilities/VariantCharts';

const baseColumns = [
  'CHROM',
  'POSITION',
  'REF',
  'ALT',
  'Gene_with_variant',
  'Variant_consequence_calculated',
  'Variant_severity',
  'Variant_frequency_in_gnomAD',
  'Patients with this variant in subset',
  'Patients with this variant NOT in subset',
];

function columns(patients: string[] = []): Column[] {
  return [...baseColumns, ...patients].map((name) => ({ dataElement: name, label: name }));
}

function row(values: Partial<Record<string, string>>): Indexable {
  return {
    CHROM: '17',
    POSITION: '1000',
    REF: 'G',
    ALT: 'A',
    Gene_with_variant: 'BRCA1',
    Variant_consequence_calculated: 'missense_variant',
    Variant_severity: 'MODERATE',
    Variant_frequency_in_gnomAD: '0.01',
    'Patients with this variant in subset': '1/4',
    'Patients with this variant NOT in subset': '0/0',
    ...values,
  };
}

type Trace = { name?: string; x: (number | string | null)[]; y: (number | null)[] };

describe('parseCarriers', () => {
  it('reads "k/n" carrier counts', () => {
    expect(parseCarriers('3/133')).toEqual({ carriers: 3, total: 133 });
    expect(parseCarriers('null')).toBeNull();
  });
});

describe('toChartVariants', () => {
  it('computes allele frequency from genotype columns of a full export', () => {
    const patients = ['p1', 'p2', 'p3', 'p4'];
    const [variant] = toChartVariants(
      [
        row({
          p1: '0/1',
          p2: '1/1',
          p3: '0/0',
          p4: '0/0',
          'Patients with this variant in subset': '2/4',
        }),
      ],
      columns(patients),
    );

    // 1 heterozygous + 1 homozygous = 3 alleles of 8
    expect(variant.cohortAlleleFrequency).toBe(3 / 8);
    expect(variant.carriers).toBe(2);
    expect(variant.subsetSize).toBe(4);
  });

  it('has no allele frequency in an aggregate export', () => {
    const [variant] = toChartVariants([row({})], columns());
    expect(variant.cohortAlleleFrequency).toBeNull();
  });

  it('keeps the most severe of several values and treats "null" as missing', () => {
    const [variant] = toChartVariants(
      [
        row({
          Variant_severity: 'LOW,HIGH',
          Variant_frequency_in_gnomAD: 'null',
          Gene_with_variant: 'null',
        }),
      ],
      columns(),
    );

    expect(variant.severity).toBe('HIGH');
    expect(variant.gnomadFrequency).toBeNull();
    expect(variant.genes).toEqual([]);
  });

  it('reads gnomAD frequencies in scientific notation', () => {
    const [variant] = toChartVariants(
      [row({ Variant_frequency_in_gnomAD: '3.18512e-05' })],
      columns(),
    );
    expect(variant.gnomadFrequency).toBeCloseTo(3.18512e-5);
  });
});

describe('variant charts', () => {
  const variants = toChartVariants(
    [
      row({
        POSITION: '300',
        Variant_severity: 'HIGH',
        Variant_consequence_calculated: 'stop_gained',
      }),
      row({ POSITION: '100', 'Patients with this variant in subset': '3/4' }),
      row({ POSITION: '200', Gene_with_variant: 'TP53', Variant_frequency_in_gnomAD: 'null' }),
      row({ POSITION: '400', 'Patients with this variant in subset': '0/4' }),
    ],
    columns(),
  );

  it('orders genes by number of variants', () => {
    expect(genesByVariantCount(variants)).toEqual(['BRCA1', 'TP53']);
  });

  it('counts variants or carriers per consequence, one trace per severity', () => {
    const plot = createConsequencePlot(variants);
    const traces = plot.data as unknown as Trace[];

    expect(traces.map((t) => t.name)).toEqual(['HIGH', 'MODERATE']);
    expect(traces[1].x).toEqual(['missense_variant', 'stop_gained']);
    expect(traces[1].y).toEqual([3, 0]);
    const carriers = (plot.layout.updatemenus as { buttons: { args: { y: number[][] }[] }[] }[])[0]
      .buttons[1].args[0].y;
    // MODERATE missense carriers: 3 + 1 + 0
    expect(carriers[1]).toEqual([4, 0]);
  });

  it('draws one stem per variant of the chosen gene, sorted by position', () => {
    const plot = createLollipopPlot(variants, 'BRCA1');
    const [stems] = plot.data as unknown as Trace[];

    expect(stems.x).toEqual([100, 100, null, 300, 300, null, 400, 400, null]);
    expect(stems.y).toEqual([0, 3, null, 0, 1, null, 0, 0, null]);
    expect(plot.layout.xaxis?.title).toEqual({ text: 'Position on chromosome 17' });
  });

  it('places only variants with a gnomAD frequency and cohort carriers on the log-log plot', () => {
    const plot = createFrequencyPlot(variants);
    const points = (plot.data as unknown as Trace[]).slice(1);

    expect(plot.notInGnomad).toBe(1);
    expect(plot.notInCohort).toBe(1);
    expect(points.flatMap((t) => t.y)).toEqual([0.25, 0.75]);
    expect(plot.layout.yaxis?.title).toEqual({ text: 'Share of cohort carrying the variant' });
  });
});
