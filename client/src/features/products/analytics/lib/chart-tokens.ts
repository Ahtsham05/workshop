/*
 * Chart color tokens. Series 1/2 are the validated categorical blue/orange pair (checked for
 * colorblind separation and contrast against this app's white card and its dark navy card);
 * gridlines and axis text follow the theme's own border/muted tokens so charts sit quietly
 * on the card in both modes.
 */
export const CHART_VARS =
  '[--series-1:#2a78d6] [--series-2:#eb6834] dark:[--series-1:#3987e5] dark:[--series-2:#d95926]'

export const SERIES_1 = 'var(--series-1)'
export const SERIES_2 = 'var(--series-2)'

export const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 11 }
export const GRID_STROKE = 'var(--border)'
