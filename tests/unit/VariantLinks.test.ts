import { describe, it, expect } from 'vitest';
import { variantLinks } from '$lib/utilities/VariantLinks';

// CFTR F508del: 7:117199644 in GRCh37, 7:117559590 in GRCh38
const f508del37 = { CHROM: '7', POSITION: '117199644', REF: 'ATCT', ALT: 'A' };

function urls(links: { name: string; url: string }[]): Record<string, string> {
  return Object.fromEntries(links.map((link) => [link.name, decodeURIComponent(link.url)]));
}

describe('variantLinks', () => {
  it('links gnomAD v2 and GRCh37 positions for GRCh37 data', () => {
    expect(urls(variantLinks(f508del37, 'GRCh37'))).toEqual({
      gnomAD: 'https://gnomad.broadinstitute.org/variant/7-117199644-ATCT-A?dataset=gnomad_r2_1',
      dbSNP: 'https://www.ncbi.nlm.nih.gov/snp/?term=7[CHR] AND 117199644[POSITION_GRCH37]',
      ClinVar: 'https://www.ncbi.nlm.nih.gov/clinvar/?term=7[chr] AND 117199644[chrpos37]',
    });
  });

  it('links gnomAD v4 and GRCh38 positions for GRCh38 data', () => {
    const row = { CHROM: 'chr7', POSITION: '117559590', REF: 'ATCT', ALT: 'A' };
    expect(urls(variantLinks(row, 'GRCh38'))).toEqual({
      gnomAD: 'https://gnomad.broadinstitute.org/variant/7-117559590-ATCT-A?dataset=gnomad_r4',
      dbSNP: 'https://www.ncbi.nlm.nih.gov/snp/?term=7[CHR] AND 117559590[POSITION]',
      ClinVar: 'https://www.ncbi.nlm.nih.gov/clinvar/?term=7[chr] AND 117559590[chrpos38]',
    });
  });

  it('treats hg19 as GRCh37', () => {
    expect(urls(variantLinks(f508del37, 'hg19')).gnomAD).toContain('dataset=gnomad_r2_1');
  });

  it('names the mitochondrion as each gnomAD version does', () => {
    const row = { CHROM: 'chrM', POSITION: '8993', REF: 'T', ALT: 'G' };
    expect(urls(variantLinks(row, 'GRCh37')).gnomAD).toContain('/variant/MT-8993-T-G');
    expect(urls(variantLinks(row, 'GRCh38')).gnomAD).toContain('/variant/M-8993-T-G');
  });

  it('skips gnomAD when the alleles are not plain bases', () => {
    const row = { ...f508del37, ALT: '<DEL>' };
    expect(variantLinks(row, 'GRCh37').map((link) => link.name)).toEqual(['dbSNP', 'ClinVar']);
  });

  it('returns no links without a position', () => {
    expect(variantLinks({ CHROM: '7', POSITION: 'null', REF: 'A', ALT: 'G' }, 'GRCh37')).toEqual(
      [],
    );
  });
});
