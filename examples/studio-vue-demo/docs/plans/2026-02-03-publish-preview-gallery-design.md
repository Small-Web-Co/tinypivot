# Publish, Preview & Gallery Design

**Date:** 2026-02-03
**Status:** Draft

## Overview

This design covers publishing dashboards for public consumption, improving the edit/preview experience, and adding a gallery for discovering shared reports.

## Goals

1. Enable users to publish pages via shareable URLs
2. Make edit mode feel closer to preview (reduce mode switching)
3. Persist widget state across page reloads
4. Provide a central gallery of public reports
5. Support collision-aware grid resize
6. Enable PDF export

---

## 1. Core Architecture

### New Components

| Component | Purpose |
|-----------|---------|
| `PageViewer.vue` | Read-only renderer for published pages (used by gallery, embed, preview) |
| `ReportGallery.vue` | Public-facing gallery at `/explore` route |
| `GalleryPanel.vue` | In-studio gallery tab alongside page list |
| `ShareModal.vue` | Configure and manage page sharing |

### State Persistence

- Widget view state stored in `localStorage` as `tinypivot-widget-state-{widgetId}`
- Last opened page stored as `tinypivot-last-page`
- Restored on mount, data refetched automatically

---

## 2. Widget Hover UX

### Behavior

**When widget is unfocused** (mouse outside):
- Tab bar (AI Analyst, Grid, Pivot, Chart) hidden
- Config panels collapsed
- Only the active visualization renders (table, chart, pivot)
- Subtle border or none — looks like final published state

**When widget is focused** (mouse enters or clicked):
- Fade in tab bar (150ms transition)
- Show drag handle, config gear, delete button
- Full editing capability

### Implementation

```
Widget component:
├── isHovered: boolean (track mouse enter/leave)
├── isFocused: boolean (track click focus, persists until click outside)
├── showControls: computed(() => isHovered || isFocused)
└── CSS transitions on opacity/max-height for smooth reveal
```

### Edge Cases

- If user is actively interacting with a dropdown/modal inside the widget, keep controls visible even if mouse leaves
- Keyboard navigation: Tab into widget focuses it
- Touch devices: First tap focuses, controls stay until tap outside

### Studio-Only Flag

- `PageViewer.vue` renders widgets with `editable={false}`
- Widget checks this prop and never shows edit chrome regardless of hover

---

## 3. Collision-Aware Grid Resize

### How It Works

1. User starts dragging a widget's resize handle (e.g., right edge)
2. On each drag frame, detect if new size would collide with a neighbor
3. If collision detected with a horizontal neighbor:
   - Calculate overlap amount
   - Shrink neighbor by that amount (if above minimum)
   - If neighbor at minimum, cap the resize
4. On drag end, commit both widgets' new sizes to state

### Minimum Sizes

- Width: 2 columns (out of 12) — ~16% of container
- Height: 2 rows — enough for a meaningful chart/table header

### Code Approach

```typescript
// Hook into native pointer events on resize handles
// (GridStack's resizestop is too late for live feedback)

onResizeHandleDrag(widgetId, newWidth):
  neighbor = findHorizontalNeighbor(widgetId, direction)
  if (!neighbor) return // No collision possible

  overlap = calculateOverlap(widget, newWidth, neighbor)
  if (overlap > 0):
    neighborMinWidth = 2
    shrinkAmount = min(overlap, neighbor.w - neighborMinWidth)

    if (shrinkAmount > 0):
      neighbor.w -= shrinkAmount
      neighbor.x += shrinkAmount // Shift if shrinking from left
      widget.w = newWidth
    else:
      widget.w = newWidth - (overlap - shrinkAmount) // Cap resize
```

### Visual Feedback

- While dragging, neighbor widget shows subtle highlight indicating it will resize
- If neighbor is at minimum, show a "locked" indicator (can't shrink further)

---

## 4. Share & Publish Flow

### Publishing a Page

1. User clicks "Share" button in page toolbar
2. Modal opens with options:
   - **Visibility**: Public (listed in gallery) / Unlisted (link only) / Password protected
   - **Access level**: View only / Interactive (filters work) / Allow duplicate
   - **Options**: Show author name, allow embed, allow PDF export
3. On save, generates a share token (e.g., `abc123xyz`)
4. Share URL displayed: `{baseUrl}/view/{token}`
5. Copy button for easy sharing

### Share URL Resolution

```
/view/:token route:
  1. Fetch PageShare by token (storage.getShareByToken)
  2. Check if active, not expired, under max views
  3. If password protected, show password prompt
  4. Load full Page data
  5. Render with PageViewer (read-only)
  6. Increment view count
```

### Revoking/Updating Shares

- Same modal shows existing share if active
- Can update settings or revoke entirely
- Revoking invalidates the token immediately

### Data Fetching for Viewers

- PageViewer calls the same query API as edit mode
- Widgets refetch their data on mount
- Share settings control whether viewers can interact with filters

---

## 5. Report Gallery

### Public Gallery (`/explore` route)

- Grid of report cards showing:
  - Title, description (truncated)
  - Author name (if `showAuthor` enabled)
  - Thumbnail (auto-generated screenshot on publish)
  - View count, published date
- Filter/sort options: Recent, Popular, by tag
- Search by title/description
- Clicking a card navigates to `/view/{token}`

### In-Studio Gallery (`GalleryPanel.vue`)

- New tab in sidebar alongside "My Pages"
- Same card layout but integrated in studio shell
- Shows all public reports from all users
- "Open in Editor" option if user has duplicate permission
- Quick filter: "My Published" vs "All Public"

### Data Source

```typescript
// New storage method
storage.listPublicShares(options: {
  sortBy: 'recent' | 'popular' | 'title'
  search?: string
  tags?: string[]
  limit: number
  offset: number
}): Promise<PaginatedResult<PublicShareListItem>>

interface PublicShareListItem {
  token: string
  pageTitle: string
  pageDescription?: string
  authorName?: string
  viewCount: number
  publishedAt: Date
  tags?: string[]
  thumbnailUrl?: string
}
```

### Thumbnail Generation

- Capture screenshot of page on publish using html2canvas or similar
- Store as base64 or upload to storage
- Display in gallery cards
- Fallback to placeholder if capture fails

---

## 6. State Persistence & Data Refresh

### What Gets Persisted (localStorage)

| Key | Data | When Updated |
|-----|------|--------------|
| `tinypivot-last-page` | `{ pageId: string }` | On page select |
| `tinypivot-widget-state-{widgetId}` | `{ activeTab, columns, sortOrder, filters }` | On widget interaction |

### Restore Flow on Page Load

```
1. App mounts
2. Check localStorage for last-page
3. If found, load that page from storage
4. For each widget block:
   a. Check localStorage for widget state
   b. Restore activeTab, columns, sortOrder, filters
   c. Fetch fresh data from datasource with restored config
5. Render widgets with restored state + fresh data
```

### Data Refetch Triggers

- Page load (always fetch fresh)
- Manual refresh button per widget
- Filter changes (page-level or widget-level)
- "Refresh all" button in toolbar

### Stale State Handling

- If widget config changed (columns removed, etc.), gracefully ignore invalid state
- If widget deleted, clean up its localStorage entry

---

## 7. PDF Export

### Approach

Use browser print with `@media print` styles, then "Save as PDF":

1. User clicks "Export PDF" (in share modal or toolbar)
2. Trigger `window.print()` with print-optimized styles
3. Browser's native "Save as PDF" handles the rest

### Print Styles

- Hide all edit chrome, toolbars, navigation
- Page breaks between widgets (avoid cutting tables mid-row)
- Expand collapsed content
- Use print-friendly colors (no dark mode)

### Future Enhancement (Optional)

- Server-side PDF generation with Puppeteer for higher fidelity
- But browser print is sufficient to start

---

## Implementation Order

| Phase | Items | Rationale |
|-------|-------|-----------|
| 1 | Widget hover UX | Quick win, improves edit experience immediately |
| 2 | PageViewer + Share flow | Core publishing capability |
| 3 | State persistence | Better reload experience |
| 4 | Public gallery + In-studio gallery | Discovery layer |
| 5 | Collision-aware resize | Polish, more complex |
| 6 | PDF export | Uses PageViewer, straightforward |
| 7 | Thumbnail capture | Nice-to-have, can defer |

---

## Open Questions

None at this time — ready for implementation.

---

## Appendix: Existing Type Infrastructure

The following types already exist in `/packages/studio/src/types/share.ts` and can be leveraged:

- `ShareAccessLevel`: 'view' | 'interact' | 'duplicate'
- `ShareVisibility`: 'public' | 'unlisted' | 'password'
- `PageShareSettings`: Full settings object
- `PageShare`: Share record with token, view count, etc.

Storage adapter already has share-related methods defined but not fully implemented:
- `getShareSettings(pageId)`
- `updateShareSettings(pageId, settings)`
- `getShareByToken(token)`
- `createShare(pageId, settings)`
- `revokeShare(token)`
- `recordShareView(token)`
