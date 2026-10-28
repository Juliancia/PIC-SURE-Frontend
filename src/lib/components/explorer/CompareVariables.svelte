<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import * as api from '$lib/api';
  import PlotlyPlot from '$lib/components/plots/PlotlyPlot.svelte';
  import ErrorAlert from '$lib/components/ErrorAlert.svelte';
  import Loading from '$lib/components/Loading.svelte';
  import { Picsure } from '$lib/paths';
  import type { Filter } from '$lib/models/Filter.svelte';
  import {
    type GroupedPlotData,
    type PlotValues,
    type PlotlyNewPlot,
    createGroupedPlot,
  } from '$lib/utilities/Plotly';
  import { getQueryRequestV3 } from '$lib/utilities/QueryBuilder';
  import {
    isCategoricalVariable,
    visualizationVariableLabel,
  } from '$lib/utilities/VisualizationData';

  interface Props {
    variables: Filter[];
    newPlot: PlotlyNewPlot;
  }

  let { variables, newPlot }: Props = $props();

  const groupOptions = $derived(variables.filter(isCategoricalVariable));
  let groupBy = $state('');
  let target = $state('');
  let plot: PlotValues | undefined = $state();
  let loading = $state(false);
  let error = $state('');

  const FALLBACK_ERROR = 'These variables could not be compared. Please try again later.';

  // The visualization service answers 400 with {"error": "..."}; api.ts passes that text through as body.message
  function errorMessage(e: unknown) {
    if (!isHttpError(e, 400)) return FALLBACK_ERROR;
    try {
      return JSON.parse(e.body.message).error || FALLBACK_ERROR;
    } catch {
      return FALLBACK_ERROR;
    }
  }

  async function compare() {
    loading = true;
    error = '';
    plot = undefined;
    const query = getQueryRequestV3();
    try {
      const resp: GroupedPlotData = await api.post(
        Picsure.Visualization.GroupedDistributions,
        { query: query.query, groupBy, target },
        undefined,
        true,
      );
      plot = createGroupedPlot(resp);
    } catch (e) {
      console.error('Grouped visualization failed', e);
      error = errorMessage(e);
    } finally {
      loading = false;
    }
  }
</script>

<section class="w-3/4 mx-auto my-8" data-testid="compare-variables">
  <h3 class="h4 mb-2">Compare two variables</h3>
  <p class="mb-4">
    Show how one variable is distributed within each category of another variable in your cohort.
  </p>
  <div class="flex flex-row flex-wrap gap-4 items-end">
    <label class="label w-auto">
      <span>Group by (categorical)</span>
      <select class="select" bind:value={groupBy} data-testid="compare-group-by">
        <option value="" disabled>Choose a variable</option>
        {#each groupOptions as variable (variable.id)}
          <option value={variable.id}>{visualizationVariableLabel(variable)}</option>
        {/each}
      </select>
    </label>
    <label class="label w-auto">
      <span>Show</span>
      <select class="select" bind:value={target} data-testid="compare-target">
        <option value="" disabled>Choose a variable</option>
        {#each variables.filter((variable) => variable.id !== groupBy) as variable (variable.id)}
          <option value={variable.id}>{visualizationVariableLabel(variable)}</option>
        {/each}
      </select>
    </label>
    <button
      class="btn preset-filled-primary-500"
      disabled={!groupBy || !target || groupBy === target || loading}
      onclick={compare}
      data-testid="compare-button">Compare</button
    >
  </div>
  {#if error}
    <div class="mt-4">
      <ErrorAlert color="warning">{error}</ErrorAlert>
    </div>
  {/if}
  <div class="flex justify-center mt-4">
    {#if loading}
      <Loading ring size="medium" />
    {:else if plot}
      {#key plot}
        <PlotlyPlot index={-1} data={plot.data} layout={plot.layout} meta={plot.meta} {newPlot} />
      {/key}
    {/if}
  </div>
</section>
