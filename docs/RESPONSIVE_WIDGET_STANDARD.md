# Responsive Widget Standard

Reference for widget sizing, breakpoint behavior, and the auto-scaling system.

## Breakpoint Reference

All widget sizes are defined relative to the `xl` (12-column / BASE_COLS) breakpoint. Other breakpoints are computed automatically via proportional scaling. Breakpoints are derived from a max column width of 150px — every 300px of viewport width adds 2 columns, keeping the unit box aspect ratio between 1.0:1 and 1.5:1.

| Key | Min Width | Columns | Scale Factor | ColW Range  | Ratio Range |
|-----|-----------|---------|-------------|-------------|-------------|
| xxl | 1800px    | 14      | 1.17x       | 129–150px   | 1.29–1.5    |
| xl  | 1500px    | 12      | 1.00x (base)| 125–150px   | 1.25–1.5    |
| lg  | 1200px    | 10      | 0.83x       | 120–150px   | 1.20–1.5    |
| md  | 900px     | 8       | 0.67x       | 112–150px   | 1.12–1.5    |
| sm  | 600px     | 6       | 0.50x       | 100–150px   | 1.00–1.5    |
| xs  | 300px     | 4       | 0.33x       | 75–150px    | 0.75–1.5    |
| xxs | 0px       | 2       | 0.17x       | —–150px     | —–1.5       |

Grid constants: row height = 100px, margin = 16px (both axes).

## Widget Sizing Tiers

Standard size categories for widget authors. Choose the tier that best fits your widget's content density. Sizes are defined at the xl (12-col) base breakpoint.

| Tier | xl Cols | Screen % | Use Case                         |
|------|---------|----------|----------------------------------|
| XS   | 2       | ~17%     | Compact info, badges, indicators |
| S    | 3       | 25%      | Single-purpose widgets           |
| M    | 4       | 33%      | Standard widgets (recommended default) |
| L    | 6       | 50%      | Data-rich widgets, tables        |
| XL   | 8       | 67%      | Dashboards, large charts         |
| Full | 12      | 100%     | Full-width panels, timelines     |

## Auto-Scale Reference

How each tier maps across all breakpoints (computed automatically):

| Tier | xxl (14) | xl (12) | lg (10) | md (8) | sm (6) | xs (4) | xxs (2) |
|------|----------|---------|---------|--------|--------|--------|---------|
| XS   | 2        | 2       | 2       | 1      | 1      | 1      | 1       |
| S    | 4        | 3       | 3       | 2      | 2      | 1      | 1       |
| M    | 5        | 4       | 3       | 3      | 2      | 1      | 1       |
| L    | 7        | 6       | 5       | 4      | 3      | 2      | 1       |
| XL   | 9        | 8       | 7       | 5      | 4      | 3      | 1       |
| Full | 14       | 12      | 10      | 8      | 6      | 4      | 2       |

Values are `round(xlCols * scale)`, clamped to `[1, breakpointCols]`.

## Defining WidgetSize

When registering a widget, provide a `size` object in the meta:

```ts
size: {
  minW: 2,       // Minimum width at xl (12-col) scale
  minH: 2,       // Minimum height in rows
  maxW: 8,       // Optional: maximum width at xl scale
  maxH: 6,       // Optional: maximum height in rows
  defaultW: 4,   // Default width (tier M)
  defaultH: 3,   // Default height
}
```

Guidelines:
- `minW` / `maxW` define the horizontal resize range at the xl breakpoint. These constraints are auto-scaled to other breakpoints.
- `minH` / `maxH` are row-based and do not scale (vertical dimension is viewport-independent).
- `defaultW` / `defaultH` determine the initial size when a widget is added.
- Choose `defaultW` from the sizing tiers above based on your content needs.

## Height Guidelines

| Rows | Approx Height | Suitable For                      |
|------|---------------|-----------------------------------|
| 1    | 100px         | Single-line status, badges        |
| 2    | 216px         | Compact cards, counters           |
| 3    | 332px         | Standard widgets                  |
| 4    | 448px         | Widgets with lists or small charts|
| 5    | 564px         | Data tables, detailed views       |
| 6+   | 680px+        | Full dashboards, large charts     |

Height formula: `rows * 100 + (rows - 1) * 16` px (row height + gaps).

## Scaling Logic

Forward scaling (xl to other breakpoints):
```
scale = targetCols / 12
targetW = clamp(round(xlW * scale), scaledMinW, scaledMaxW)
targetX = clamp(round(xlX * scale), 0, targetCols - targetW)
h, y = unchanged
```

Reverse scaling (non-xl back to xl for persistence):
```
xlW = clamp(round(currentW * 12 / currentCols), minW, maxW)
xlX = clamp(round(currentX * 12 / currentCols), 0, 12 - xlW)
```

The store always persists xl-reference (BASE_COLS = 12) layouts. Scaling is view-layer only, computed at render time in DashboardGrid.

## Examples

### Pomodoro Timer (Tier S)
```ts
size: {
  minW: 2,
  minH: 2,
  maxW: 4,
  maxH: 4,
  defaultW: 3,
  defaultH: 3,
}
```
At xxl (14 cols): occupies 4 columns. At sm (6 cols): occupies 2 columns.

### Data Table (Tier L)
```ts
size: {
  minW: 4,
  minH: 3,
  maxW: 12,
  maxH: 8,
  defaultW: 6,
  defaultH: 4,
}
```
At xxl (14 cols): occupies 7 columns. At xs (4 cols): occupies 2 columns (clamped to min).
