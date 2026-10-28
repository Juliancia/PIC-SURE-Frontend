<script lang="ts">
  import { onMount } from 'svelte';
  import type { VariantData } from '$lib/models/Variant';
  import type { PlotlyNewPlot } from '$lib/utilities/Plotly';
  import {
    createConsequencePlot,
    createFrequencyPlot,
    createLollipopPlot,
    genesByVariantCount,
    toChartVariants,
  } from '$lib/utilities/VariantCharts';
  import PlotlyPlot from '$lib/components/plots/PlotlyPlot.svelte';
  import Loading from '$lib/components/Loading.svelte';

  let { data }: { data: VariantData } = $props();

  const variants = $derived(toChartVariants(data.rows, data.columns));
  const genes = $derived(genesByVariantCount(variants));
  const consequencePlot = $derived(createConsequencePlot(variants));
  const frequencyPlot = $derived(createFrequencyPlot(variants));

  let gene = $state('');
  const selectedGene = $derived(gene || genes[0] || '');
  const lollipopPlot = $derived(
    selectedGene ? createLollipopPlot(variants, selectedGene) : undefined,
  );

  let newPlot: PlotlyNewPlot | undefined = $state();
  onMount(async () => {
    // Plotly must be loaded into the rendered page; see Visualizations.svelte
    const Plotly = await import('plotly.js-basic-dist-min');
    newPlot = Plotly.newPlot;
  });
</script>

{#if !newPlot}
  <Loading ring size="medium" />
{:else}
  <div class="flex flex-row flex-wrap gap-6 justify-center" data-testid="variant-charts">
    <PlotlyPlot
      index={101}
      data={consequencePlot.data}
      layout={consequencePlot.layout}
      meta={consequencePlot.meta}
      {newPlot}
    />

    <div class="flex flex-col items-center">
      <label class="label w-auto self-start ml-4">
        <span>Gene</span>
        <select class="select" bind:value={gene} data-testid="variant-chart-gene">
          {#each genes as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </label>
      {#if lollipopPlot}
        {#key selectedGene}
          <PlotlyPlot
            index={102}
            data={lollipopPlot.data}
            layout={lollipopPlot.layout}
            meta={lollipopPlot.meta}
            {newPlot}
          />
        {/key}
      {:else}
        <p>No gene annotation in these variants.</p>
      {/if}
    </div>

    <div class="flex flex-col items-center">
      <PlotlyPlot
        index={103}
        data={frequencyPlot.data}
        layout={frequencyPlot.layout}
        meta={frequencyPlot.meta}
        {newPlot}
      />
      {#if frequencyPlot.notInGnomad || frequencyPlot.notInCohort}
        <p class="text-sm max-w-[700px]" data-testid="variant-chart-not-shown">
          Not shown on this chart:
          {#if frequencyPlot.notInGnomad}
            {frequencyPlot.notInGnomad.toLocaleString()} variants without a gnomAD frequency (novel){frequencyPlot.notInCohort
              ? ','
              : '.'}
          {/if}
          {#if frequencyPlot.notInCohort}
            {frequencyPlot.notInCohort.toLocaleString()} variants with no carriers in the cohort.
          {/if}
        </p>
      {/if}
    </div>
  </div>
{/if}
