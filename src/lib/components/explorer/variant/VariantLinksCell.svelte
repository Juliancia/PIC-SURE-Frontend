<script lang="ts">
  import { config } from '$lib/configuration.svelte';
  import type { Indexable } from '$lib/types';
  import { variantLinks } from '$lib/utilities/VariantLinks';
  import { log, createLog } from '$lib/logger';

  let { data = { row: {} } }: { data: { row: Indexable } } = $props();

  const build = $derived(config.branding.genomic?.defaultGenomeBuild || 'GRCh38');
  const links = $derived(variantLinks(data.row, build));
</script>

<div class="flex gap-2 whitespace-nowrap" data-testid="variant-links">
  {#each links as link (link.name)}
    <a
      class="anchor"
      href={link.url}
      target="_blank"
      rel="external noopener noreferrer"
      title="{link.name} ({build})"
      onclick={() => log(createLog('NAVIGATION', 'variant.external_link', { site: link.name }))}
      >{link.name}</a
    >
  {/each}
</div>
