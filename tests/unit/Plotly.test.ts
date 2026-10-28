import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/configuration.svelte', () => ({
  config: { settings: { distributionExplorer: { graphColors: ['#111111', '#222222'] } } },
}));

import {
  createCategoryPlot,
  createContinuousPlot,
  createGroupedPlot,
  type GroupedPlotData,
  type CategoricalPlotData,
  type ContinuousPlotData,
} from '$lib/utilities/Plotly';

const baseChart = {
  title: 'demographics: race',
  continuous: false,
  colors: [],
  chartWidth: 500,
  chartHeight: 600,
  xaxisName: 'race',
  yaxisName: 'Number of Participants',
};

type BarTrace = { x: string[]; y: number[]; text?: string[] };

function categoricalPlot(map: CategoricalPlotData['categoricalMap'], obfuscated = false) {
  const plot = createCategoryPlot({
    ...baseChart,
    obfuscated,
    categoricalMap: map,
  } as CategoricalPlotData);
  const [solid, hatched] = plot.data as unknown as [BarTrace, BarTrace];
  return { plot, solid, hatched };
}

describe('createCategoryPlot', () => {
  it('renders exact (authorized) values as plain bars with no uncertainty band', () => {
    const { solid, hatched } = categoricalPlot({
      White: { count: 45000, display: '45000', variance: null },
      Black: { count: 12000, display: '12000', variance: null },
    });

    expect(solid.y).toEqual([45000, 12000]);
    expect(hatched.y).toEqual([0, 0]);
    expect(hatched.text).toEqual(['45000', '12000']);
  });

  it('renders variance values with a band spanning count ± variance', () => {
    const { solid, hatched } = categoricalPlot(
      { White: { count: 222, display: '222 ±3', variance: 3 } },
      true,
    );

    // Solid bar to count - variance, band of 2 * variance on top (top of stack = count + variance)
    expect(solid.y).toEqual([219]);
    expect(hatched.y).toEqual([6]);
    expect(hatched.text).toEqual(['222 ±3']);
  });

  it('renders below-threshold values as a fully hatched bar up to the threshold band', () => {
    const { solid, hatched } = categoricalPlot(
      { Other: { count: 0, display: '< 10', variance: 9 } },
      true,
    );

    expect(solid.y).toEqual([0]);
    expect(hatched.y).toEqual([9]);
    expect(hatched.text).toEqual(['< 10']);
  });

  it('clamps the band at zero when variance exceeds count', () => {
    const { solid, hatched } = categoricalPlot(
      { Rare: { count: 2, display: '2 ±3', variance: 3 } },
      true,
    );

    expect(solid.y).toEqual([0]);
    // Band runs from 0 to count + variance
    expect(hatched.y).toEqual([5]);
  });

  it('normalizes legacy plain-number values into exact bars', () => {
    const { solid, hatched } = categoricalPlot({ White: 45000, Black: 12000 });

    expect(solid.y).toEqual([45000, 12000]);
    expect(hatched.y).toEqual([0, 0]);
    expect(hatched.text).toEqual(['45000', '12000']);
  });
});

describe('createContinuousPlot', () => {
  function continuousPlot(map: ContinuousPlotData['continuousMap'], obfuscated = false) {
    const plot = createContinuousPlot({
      ...baseChart,
      title: 'measurements: bmi',
      continuous: true,
      obfuscated,
      continuousMap: map,
    } as ContinuousPlotData);
    const [solid, hatched] = plot.data as unknown as [BarTrace, BarTrace];
    return { plot, solid, hatched };
  }

  it('orders bins by their lower limit and renders counts and labels', () => {
    const { solid, hatched } = continuousPlot({
      '30.0 +': { count: 150, display: '150 ±3', variance: 3 },
      '18.0 - 24.0': { count: 600, display: '600 ±3', variance: 3 },
      '24.0 - 30.0': { count: 0, display: '< 10', variance: 9 },
    });

    expect(solid.x).toEqual(['18.0 - 24.0', '24.0 - 30.0', '30.0 +']);
    expect(solid.y).toEqual([597, 0, 147]);
    expect(hatched.y).toEqual([6, 9, 6]);
    expect(hatched.text).toEqual(['600 ±3', '< 10', '150 ±3']);
  });

  it('normalizes legacy plain-number values', () => {
    const { solid, hatched } = continuousPlot({
      '18.0 - 24.0': 600,
      '24.0 - 30.0': 700,
    });

    expect(solid.y).toEqual([600, 700]);
    expect(hatched.y).toEqual([0, 0]);
    expect(hatched.text).toEqual(['600', '700']);
  });
});

describe('plot interactivity', () => {
  type HoverTrace = BarTrace & { customdata: string[][]; hovertemplate: string };
  type Menu = { buttons: { label: string; args: Record<string, unknown>[] }[] };

  function menuLabels(layout: { updatemenus?: unknown }) {
    return (layout.updatemenus as Menu[]).map((menu) => menu.buttons.map((b) => b.label));
  }

  it('shows the backend display value and percent of total on hover for exact counts', () => {
    const { plot, solid } = categoricalPlot({
      White: { count: 300, display: '300', variance: null },
      Black: { count: 100, display: '100', variance: null },
    });
    const trace = solid as HoverTrace;

    expect(plot.layout.hovermode).toBe('closest');
    expect(trace.customdata).toEqual([
      ['300', '75.0%'],
      ['100', '25.0%'],
    ]);
    expect(trace.hovertemplate).toContain('%{customdata[1]}');
  });

  it('offers count/percent, linear/log and sort controls for exact categorical data', () => {
    const { plot } = categoricalPlot({ White: 300, Black: 100 });

    expect(menuLabels(plot.layout)).toEqual([
      ['Count', 'Percent'],
      ['Linear', 'Log'],
      ['Original order', 'Sort by count'],
    ]);
    const percent = (plot.layout.updatemenus as Menu[])[0].buttons[1].args[0];
    expect(percent.y).toEqual([
      [75, 25],
      [0, 0],
    ]);
    expect(percent.text).toEqual([null, ['75.0%', '25.0%']]);
  });

  it('does not offer percentages for obfuscated data', () => {
    const { plot, hatched } = categoricalPlot(
      { Other: { count: 0, display: '< 10', variance: 9 } },
      true,
    );

    expect(menuLabels(plot.layout)).toEqual([
      ['Linear', 'Log'],
      ['Original order', 'Sort by count'],
    ]);
    expect((hatched as HoverTrace).hovertemplate).not.toContain('%{customdata[1]}');
  });

  it('has no sort control for continuous data', () => {
    const plot = createContinuousPlot({
      ...baseChart,
      continuous: true,
      obfuscated: false,
      continuousMap: { '18.0 - 24.0': 600, '24.0 - 30.0': 200 },
    } as ContinuousPlotData);

    expect(menuLabels(plot.layout)).toEqual([
      ['Count', 'Percent'],
      ['Linear', 'Log'],
    ]);
  });
});

describe('createGroupedPlot', () => {
  type GroupedTrace = BarTrace & { name: string; customdata: string[][] };
  type Menu = { active: number; buttons: { label: string; args: Record<string, unknown>[] }[] };

  const grouped: GroupedPlotData = {
    groupBy: '\\demographics\\SEX\\',
    target: '\\clinical\\DIAGNOSIS\\',
    title: 'clinical: DIAGNOSIS by SEX',
    groupName: 'SEX',
    xaxisName: 'DIAGNOSIS',
    yaxisName: 'Number of Participants',
    continuous: false,
    categories: ['A', 'B'],
    groups: { female: { A: 3, B: 1 }, male: { A: 1, B: 1 } },
  };

  it('draws one trace per group, starting with percent within group', () => {
    const plot = createGroupedPlot(grouped);
    const [female, male] = plot.data as unknown as GroupedTrace[];

    expect(plot.data).toHaveLength(2);
    expect(female.name).toBe('female');
    expect(female.x).toEqual(['A', 'B']);
    expect(female.y).toEqual([75, 25]);
    expect(male.y).toEqual([50, 50]);
    expect(female.customdata).toEqual([
      ['3', '75.0%'],
      ['1', '25.0%'],
    ]);
    expect(plot.layout.barmode).toBe('group');
    expect(plot.meta.isCategorical).toBe(true);
  });

  it('offers count, percent of total and percent within group', () => {
    const plot = createGroupedPlot(grouped);
    const [values, mode] = plot.layout.updatemenus as Menu[];

    expect(values.buttons.map((b) => b.label)).toEqual(['Count', '% of total', '% within group']);
    expect(values.active).toBe(2);
    expect(values.buttons[0].args[0].y).toEqual([
      [3, 1],
      [1, 1],
    ]);
    expect(values.buttons[1].args[0].y).toEqual([
      [50, 16.666666666666664],
      [16.666666666666664, 16.666666666666664],
    ]);
    expect(mode.buttons.map((b) => b.label)).toEqual(['Grouped', 'Stacked']);
  });

  it('fills a missing category with zero', () => {
    const plot = createGroupedPlot({ ...grouped, groups: { female: { A: 2 }, male: { B: 2 } } });
    const [female] = plot.data as unknown as GroupedTrace[];

    expect(female.customdata.map(([count]) => count)).toEqual(['2', '0']);
  });
});
