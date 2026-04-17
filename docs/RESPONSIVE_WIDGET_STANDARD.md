# Widget Sizing Standard

Reference for widget sizing in the fluid 12-column grid.

## Grid Model

- **Fixed 12 columns** — no breakpoints, no runtime scaling.
- **Fluid cell width** — cell width = `containerWidth / 12`, changes smoothly as the window resizes. Widget `w/h` values stay constant regardless of window size.
- **Row height**: 100px. **Margin**: 16px on both axes.
- Layout is persisted to `localStorage` (`dashboard-storage`) in grid units.

## WidgetSize

Declare in widget meta when registering:

```ts
size: {
  minW: 2,       // min width in columns
  minH: 2,       // min height in rows
  maxW: 8,       // optional max width in columns
  maxH: 6,       // optional max height in rows
  defaultW: 4,   // default width when added
  defaultH: 3,   // default height when added
}
```

All values are constants in grid units — they do **not** scale with window size.

## Sizing Tiers

Rough guide for `defaultW`:

| Tier | Cols | Screen % | Use Case                                 |
|------|------|----------|------------------------------------------|
| XS   | 2    | ~17%     | Compact info, badges, indicators         |
| S    | 3    | 25%      | Single-purpose widgets                   |
| M    | 4    | 33%      | Standard widgets (recommended default)   |
| L    | 6    | 50%      | Data-rich widgets, tables                |
| XL   | 8    | 67%      | Dashboards, large charts                 |
| Full | 12   | 100%     | Full-width panels, timelines             |

## Height Guidelines

Height formula: `rows * 100 + (rows - 1) * 16` px.

| Rows | Approx Height | Suitable For                       |
|------|---------------|------------------------------------|
| 1    | 100px         | Single-line status, badges         |
| 2    | 216px         | Compact cards, counters            |
| 3    | 332px         | Standard widgets                   |
| 4    | 448px         | Widgets with lists or small charts |
| 5    | 564px         | Data tables, detailed views        |
| 6+   | 680px+        | Full dashboards, large charts      |
