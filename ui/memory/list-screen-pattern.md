# Screen Patterns — BytesCop SaaS UI

Standard layout and style for all screens. Apply consistently to every new page.

---

## List Screen Pattern

Apply to every list/grid page.

## Structure

```
bc-pageWrap bc-pageWide
  bc-pageInner
    bc-helpLayout bc-helpLayoutRight [class.is-helpOpen]="showHelp"
      <main>
        bc-pageCard (header card)
          bc-pageCardHead
            bc-pageCardTitle (title + subtitle)
            bc-pageCardTools (Help + Refresh buttons)
          bc-pageCardFoot
            bc-pageCardFootLeft (Total badge)
            bc-pageCardFootRight (Actions dropdown + primary CTA)
        bc-card (table card)
          table.bc-table
      </main>
      <aside bc-helpPane> (contextual help, toggled by Help button)
```

## Key Rules

1. **Wide layout:** Always use `bc-pageWide` on the outer `bc-pageWrap` — removes the `max-width: 1100px` cap so the table uses full available width.

2. **Header tools (top-right):** White outline buttons (`btn btn-outline-light bc-iconBtn`) for Help and Refresh. No `bc-btnSoft` on these — must be white, not green-tinted.

3. **Footer bar (bc-pageCardFoot):**
   - Left side: `bc-badge` showing `Total: <count>`
   - Right side: `[Actions ▾]` dropdown (white outline, `bc-iconBtn`) + `[+ New Record]` green CTA (`btn-success bc-btnCtaFoot`)
   - The Actions dropdown (`bc-footDropdown`) holds secondary actions (Export CSV, etc.). Scales to any number of items without cramping the bar.
   - Primary CTA is always the rightmost button.

4. **Help aside:** Uses `bc-helpLayout bc-helpLayoutRight` grid wrapper. When `showHelp` is true, grid becomes `1fr 360px`. The aside is sticky, pushes main content (not overlay). Collapses to single column under 992px.

5. **Responsive:** Footer stacks vertically under 768px. Header tools wrap under title. Help pane goes below main on small screens.

## CSS Classes (in `src/styles.css`)

- `bc-pageWide` — uncaps max-width on `bc-pageInner` and `bc-card`
- `bc-iconBtn` — compact 34px height header button with icon + label
- `bc-pageCardFoot`, `bc-pageCardFootLeft`, `bc-pageCardFootRight` — footer action strip
- `bc-btnCtaFoot` — rounded green CTA styling
- `bc-footDropdown` — dropdown menu with cyber theme (dark bg, green hover)
- `bc-helpLayout`, `bc-helpLayoutRight`, `bc-helpPane` — aside grid layout
- `bc-helpHead`, `bc-helpBody`, `bc-helpKicker`, `bc-helpTitle`, `bc-helpList` — help pane content

## Component Pattern

```typescript
// In the component class:
showHelp = false;

toggleHelp(): void {
  this.showHelp = !this.showHelp;
}

exportCsv(items: T[]): void {
  // Build CSV string, create Blob, trigger download
}
```

## List Reference Implementation

- Users list: `src/app/features/admin/users/users-list/`
- Groups list: `src/app/features/admin/groups/groups-list/`
- Legacy reference: `archives/bytescop/ui-claude/src/app/features/engagements/engagements-list/`

---

## Edit/Create Screen Pattern

Apply to every edit and create page.

### Structure

```
bc-pageWrap bc-pageWide
  bc-pageInner
    bc-pageCard (header card)
      bc-pageCardHead
        bc-pageCardTitle (title + subtitle)
        bc-pageCardTools (Back + Help buttons)
    bc-helpLayout bc-helpLayoutRight [class.is-helpOpen]="showHelp"
      <main>
        bc-card > bc-cardInner p-4 (form card with padding)
        bc-card > bc-cardInner p-4 (additional sections, e.g. password reset)
      </main>
      <aside bc-helpPane> (contextual help)
```

### Key Rules

1. **Wide layout:** Always use `bc-pageWide` — same as list screens.

2. **Header tools (top-right):** White outline Back button (`btn btn-outline-light bc-iconBtn`, links to list page) + Help button. No `bc-btnSoft` — must be white.

3. **Card padding:** Always use `p-4` on `bc-cardInner` so form fields don't touch card borders. This is critical — bare `bc-cardInner` has no padding by default.

4. **Help aside:** Same `bc-helpLayout` pattern as list screens. Wraps the form cards and aside below the header card.

5. **Header card stays outside the help layout** — it spans full width regardless of help pane state.

6. **Multiple cards:** Edit screens may have multiple `bc-card` sections (e.g. form + password reset, form + members table). Each gets its own `bc-cardInner p-4`.

### Component Pattern

```typescript
showHelp = false;

toggleHelp(): void {
  this.showHelp = !this.showHelp;
}
```

### Edit/Create Reference Implementation

- Users create: `src/app/features/admin/users/users-create/`
- Users edit: `src/app/features/admin/users/users-edit/`
- Groups create: `src/app/features/admin/groups/groups-create/`
- Groups edit: `src/app/features/admin/groups/groups-edit/`
