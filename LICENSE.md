# TinyPivot License

## Free Tier (MIT License)

Copyright (c) 2024 TinyPivot

Permission is hereby granted, free of charge, to any person obtaining a copy
of the Free Tier features of this software and associated documentation files
(the "Software"), to deal in the Software without restriction, including without
limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

### Free Tier Features Include:
- Basic data grid display with sorting
- Column filtering with unique values
- Keyboard navigation and cell selection
- Copy/paste support
- Row striping and hover states
- Responsive column widths
- Cell number formatting

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.

---

## Pro License (Commercial)

The following features require a Pro license:

### Pro Features:
- **Pivot Table**: Full pivot table functionality with drag-and-drop configuration
- **Advanced Aggregations**: Sum, Count, Average, Min, Max, Count Distinct
- **Row/Column Totals**: Automatic total calculations
- **Percentage Mode**: View data as % of row, column, or grand total
- **Column/Row Grouping**: Multi-level grouping for pivot tables
- **Session Persistence**: Auto-save and restore pivot configuration
- **Priority Support**: Direct email support and issue prioritization

### Pricing:
- **Single Project**: $49 one-time payment
- **Unlimited Projects**: $149 one-time payment
- **Team License (up to 10 devs)**: $399 one-time payment

### How to Purchase:
Visit https://tiny-pivot.com/pricing to purchase a license.

After purchase, you'll receive a license key to unlock Pro features:

```typescript
import { DataGrid, setLicenseKey } from 'tinypivot'

setLicenseKey('YOUR_LICENSE_KEY')
```

### License Validation:
- License keys are validated locally (no network calls)
- Keys are tied to your npm username or organization
- Licenses are perpetual with 1 year of updates included

---

## Terms

1. **No Removal of Attribution**: Free tier users must keep the "Powered by TinyPivot" 
   watermark visible. Pro license removes this requirement.

2. **No Redistribution**: You may not redistribute this library as part of another 
   component library or framework.

3. **No Sub-licensing**: Licenses cannot be transferred or sub-licensed.

---

For questions about licensing, contact: license@tiny-pivot.com

