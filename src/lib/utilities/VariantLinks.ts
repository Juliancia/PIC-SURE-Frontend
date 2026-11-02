import type { Indexable } from '$lib/types';
import { VariantColumn } from '$lib/utilities/VariantCharts';

export type VariantLink = { name: string; url: string };

export function isGRCh37(build: string): boolean {
  return /grch37|hg19/i.test(build);
}

// "chr7" -> "7"; gnomAD v2 (GRCh37) calls the mitochondrion "MT", v4 (GRCh38) "M"
function normalizeChromosome(value: unknown, grch37: boolean): string {
  const chromosome = String(value ?? '')
    .trim()
    .replace(/^chr/i, '');
  if (/^(m|mt)$/i.test(chromosome)) return grch37 ? 'MT' : 'M';
  return chromosome.toUpperCase();
}

// External pages for one Variant Explorer row: gnomAD for the exact allele,
// dbSNP and ClinVar searched by position in the given genome build
export function variantLinks(row: Indexable, build: string): VariantLink[] {
  const grch37 = isGRCh37(build);
  const chromosome = normalizeChromosome(row[VariantColumn.Chromosome], grch37);
  const position = String(row[VariantColumn.Position] ?? '').trim();
  if (!chromosome || !/^\d+$/.test(position)) return [];

  const links: VariantLink[] = [];
  const ref = String(row[VariantColumn.Ref] ?? '').trim();
  const alt = String(row[VariantColumn.Alt] ?? '').trim();
  if (/^[ACGTN]+$/i.test(ref) && /^[ACGTN]+$/i.test(alt)) {
    const dataset = grch37 ? 'gnomad_r2_1' : 'gnomad_r4';
    links.push({
      name: 'gnomAD',
      url: `https://gnomad.broadinstitute.org/variant/${chromosome}-${position}-${ref.toUpperCase()}-${alt.toUpperCase()}?dataset=${dataset}`,
    });
  }

  const dbsnpPosition = grch37 ? 'POSITION_GRCH37' : 'POSITION';
  links.push({
    name: 'dbSNP',
    url: `https://www.ncbi.nlm.nih.gov/snp/?term=${encodeURIComponent(`${chromosome}[CHR] AND ${position}[${dbsnpPosition}]`)}`,
  });

  const clinvarPosition = grch37 ? 'chrpos37' : 'chrpos38';
  links.push({
    name: 'ClinVar',
    url: `https://www.ncbi.nlm.nih.gov/clinvar/?term=${encodeURIComponent(`${chromosome}[chr] AND ${position}[${clinvarPosition}]`)}`,
  });

  return links;
}
