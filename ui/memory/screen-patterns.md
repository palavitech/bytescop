# Screen Patterns — BytesCop SaaS UI

Standard layout and style for all screens. Apply consistently to every new page.

---

## List Screen Pattern

Apply to every list/grid page.

### Structure

```
bc-pageWrap bc-pageWide
  bc-pageInner
    bc-pageCard mb-3 (header card — OUTSIDE helpLayout, stays full-width)
      bc-pageCardHead
        bc-pageCardTitle (bc-h1 title + bc-sub description)
        bc-pageCardTools (Back + domain actions + Refresh + Help)
      bc-pageCardFoot
        bc-pageCardFootLeft (Total badge)
        bc-pageCardFootRight (Actions dropdown + primary CTA)
    bc-helpLayout bc-helpLayoutRight [class.is-helpOpen]="showHelp"
      <main>
        bc-card > bc-cardInner p-0 > table-responsive > table.bc-table
      </main>
      <aside bc-helpPane> (contextual help, toggled by Help button)
```

### Key Rules

1. **Wide layout:** Always use `bc-pageWide` on the outer `bc-pageWrap` — removes the `max-width: 1100px` cap so the table uses full available width.

2. **Header title:** `bc-h1` for the entity type plural ("Engagements", "Assets"), `bc-sub` for a brief description.

3. **Header tools (top-right):** White outline buttons (`btn btn-outline-light bc-iconBtn`). No `bc-btnSoft` on these — must be white, not green-tinted. **Button order:** Back (first) → domain actions (Filter, Clear Filter, etc.) → Refresh → Help (last). Every list screen must have a Back button using `Location.back()`. Pages with filtering may add a Filter button (`bi-funnel`) or conditional Clear Filter button between Back and Refresh.

4. **Footer bar (bc-pageCardFoot):**
   - Left side: `bc-badge` showing `Total: <count>` (only when `state === 'ready'`)
   - Right side: `[Actions ▾]` dropdown (white outline, `bc-iconBtn`) + `[+ New Entity]` green CTA (`btn-success bc-btn bc-btnCtaFoot`)
   - The Actions dropdown (`bc-footDropdown`) holds secondary actions (Export CSV, etc.). Scales to any number of items without cramping the bar.
   - Primary CTA is always the rightmost button, guarded by `*bcHasPermission`.

5. **Table card:** `bc-card > bc-cardInner p-0 > div.table-responsive > table.table.table-dark.mb-0.align-middle.bc-table`. Column headers use `min-width` for horizontal stability. Last column (Actions) is `text-end`.

6. **Table states (inside `<tbody>`):** Four states rendered as full-width `<tr>` rows with `td colspan="N" class="p-4"`:
   - **init:** `<div class="bc-sub">Fetching entities...</div>`
   - **error:** `<div class="alert alert-danger mb-0">Could not load entities.</div>`
   - **empty (ready + length 0):** `<div class="bc-sub">No entities found.</div>`
   - **ready:** `<ng-container *ngIf="vm.state === 'ready'">` wrapping `*ngFor` data rows

7. **Row actions:** Last `<td class="text-end">` contains action buttons. Standard set: Edit (pencil, `<a>` with routerLink) + Delete (trash3, `<button>`). Both use `btn btn-sm btn-outline-light bc-btnSoft bc-tableActionBtn` (Edit) or `btn btn-sm btn-outline-danger bc-btnSoft bc-tableActionBtn` (Delete). Edit buttons are guarded by `*bcHasPermission="'entity.update'"`, delete by `'entity.delete'`. Spacing: `me-1` between buttons.

8. **Row delete confirmation:** Uses `vm.deletingId` (not a BehaviorSubject like view screens). Wrapped in `<div class="bc-deleteConfirm">`. Short confirmation text: **"Delete?"** for most entities, **"Remove user?"** for user removal (different verb because it removes tenant membership, not the user account). Pattern:
   ```html
   <div class="bc-deleteConfirm" *ngIf="vm.deletingId === item.id">
     <span class="bc-sub me-2">Delete?</span>
     <button class="btn btn-sm btn-danger bc-btn me-1" (click)="deleteEntity(item)">
       <i class="bi bi-check-lg me-1"></i>Yes
     </button>
     <button class="btn btn-sm btn-outline-light bc-btnSoft" (click)="cancelDelete()">
       <i class="bi bi-x-lg me-1"></i>No
     </button>
   </div>
   <ng-container *ngIf="vm.deletingId !== item.id">
     <!-- Edit + Delete action buttons -->
   </ng-container>
   ```

9. **Name column:** First column links to the view page using `<a class="bc-rowLink" [routerLink]="['/entities', item.id]">`.

10. **Empty values:** Always use `—` (em dash) for missing/null values. Use `bc-sub` class for secondary text cells.

11. **Help aside:** Uses `bc-helpLayout bc-helpLayoutRight` grid wrapper. When `showHelp` is true, grid becomes `1fr 360px`. The aside is sticky, pushes main content (not overlay). Collapses to single column under 992px. **Header card stays outside the help layout** — it spans full width regardless of help pane state.

12. **Responsive:** Footer stacks vertically under 768px. Header tools wrap under title. Help pane goes below main on small screens.

### CSS Classes (in `src/styles.css`)

- `bc-pageWide` — uncaps max-width on `bc-pageInner` and `bc-card`
- `bc-iconBtn` — compact 34px height header button with icon + label
- `bc-pageCardFoot`, `bc-pageCardFootLeft`, `bc-pageCardFootRight` — footer action strip
- `bc-btnCtaFoot` — rounded green CTA styling
- `bc-footDropdown` — dropdown menu with cyber theme (dark bg, green hover)
- `bc-helpLayout`, `bc-helpLayoutRight`, `bc-helpPane` — aside grid layout
- `bc-helpHead`, `bc-helpBody`, `bc-helpKicker`, `bc-helpTitle`, `bc-helpList` — help pane content
- `bc-tableActionBtn` — row action button styling
- `bc-deleteConfirm` — inline-flex wrapper for delete confirmation buttons (component CSS)
- `bc-rowLink` — clickable row name link

### Component Pattern

```typescript
private readonly location = inject(Location); // from @angular/common

showHelp = false;

goBack(): void {
  this.location.back();
}

toggleHelp(): void {
  this.showHelp = !this.showHelp;
}

exportCsv(items: T[]): void {
  // Build CSV string, create Blob, trigger download
}

// Delete uses vm.deletingId (part of the vm$ combineLatest)
confirmDelete(id: string): void { this.deletingId$.next(id); }
cancelDelete(): void { this.deletingId$.next(null); }
```

### List Reference Implementation

- Engagements list (with filter panel + filter pills): `src/app/features/engagements/engagements-list/`
- Organizations list (no row edit/delete, only Engagements link): `src/app/features/organizations/organizations-list/`
- Assets list (with conditional Clear Filter): `src/app/features/assets/assets-list/`
- Users list (with Lock/Unlock action): `src/app/features/admin/users/users-list/`
- Groups list (delete disabled for default groups): `src/app/features/admin/groups/groups-list/`

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
        bc-pageCardTools (Back + Help)
    bc-helpLayout bc-helpLayoutRight [class.is-helpOpen]="showHelp"
      <main>
        bc-card > bc-cardInner p-4 (form card with padding)
        bc-card > bc-cardInner p-4 (additional sections, e.g. password reset)
      </main>
      <aside bc-helpPane> (contextual help)
```

### Key Rules

1. **Wide layout:** Always use `bc-pageWide` — same as list screens.

2. **Header tools (top-right):** White outline buttons (`btn btn-outline-light bc-iconBtn`). No `bc-btnSoft` — must be white. **Button order:** Back (first) → Help (last). Create/edit screens typically only have these two.

3. **Back button:** Always use `Location.back()` (from `@angular/common`) — never hardcode a `routerLink`. This ensures the Back button returns to the actual previous page in browser history, not a fixed route. Use a `<button>` element with `(click)="goBack()"`, not an `<a>` tag. See component pattern below.

4. **Card padding:** Always use `p-4` on `bc-cardInner` so form fields don't touch card borders. This is critical — bare `bc-cardInner` has no padding by default.

5. **Help aside:** Same `bc-helpLayout` pattern as list screens. Wraps the form cards and aside below the header card.

6. **Header card stays outside the help layout** — it spans full width regardless of help pane state.

7. **Multiple cards:** Edit screens may have multiple `bc-card` sections (e.g. form + password reset, form + members table). Each gets its own `bc-cardInner p-4`.

8. **Form footer buttons:** Use `bc-formFoot` for Save/Cancel buttons at the bottom of forms. This renders a border-top separator with right-aligned buttons. The negative margins (`margin: 0 -1.5rem`) make the separator span the full card width. Order: Cancel then Save (primary CTA rightmost). Cancel uses `btn btn-outline-light bc-iconBtn` (same white outlined style as Back/Help buttons). The `.bc-formFoot .bc-iconBtn` override ensures matching height and border-radius with the Save CTA.

9. **Save/Cancel navigation:** On **edit** screens, both Save and Cancel navigate to the **view page** for the entity being edited (e.g. `/organizations/:id`, `/admin/users/:id`, `/admin/groups/:id`), not the list page. On **create** screens, Save navigates to the parent context (e.g. asset create from an org navigates to `/organizations/:clientId`; otherwise falls back to the list). Cancel on create uses `Location.back()` (browser history).

### Component Pattern

```typescript
import { Location } from '@angular/common';

// inject:
private readonly location = inject(Location);

showHelp = false;

goBack(): void {
  this.location.back();
}

toggleHelp(): void {
  this.showHelp = !this.showHelp;
}
```

### Back Button HTML

```html
<button class="btn btn-outline-light bc-iconBtn" type="button" (click)="goBack()">
  <i class="bi bi-arrow-left"></i>
  <span>Back</span>
</button>
```

9. **Button icons:** Every button must have a Bootstrap Icon. Standard icon mapping:
   - **Create/New:** `bi-plus-circle`
   - **Save Changes:** `bi-check-lg`
   - **Cancel:** `bi-x-lg`
   - **Delete confirm Yes:** `bi-check-lg`
   - **Delete confirm No:** `bi-x-lg`
   - **Reset Password:** `bi-key`
   - **Edit:** `bi-pencil`
   - **Delete/Remove:** `bi-trash3` (row action), `bi-x-lg` (remove from group)
   - **Lock/Unlock:** `bi-lock` / `bi-unlock`
   - **Refresh:** `bi-arrow-repeat`
   - **Help:** `bi-question-circle`
   - **Back:** `bi-arrow-left`
   - **Export CSV:** `bi-filetype-csv`
   - **Add (inline):** `bi-plus`
   - When a button shows a spinner during loading, hide the icon and show the spinner in its place.

### Edit/Create Reference Implementation

- Users create: `src/app/features/admin/users/users-create/`
- Users edit: `src/app/features/admin/users/users-edit/`
- Groups create: `src/app/features/admin/groups/groups-create/`
- Groups edit: `src/app/features/admin/groups/groups-edit/`

---

## View Screen Pattern

Apply to every read-only detail/view page.

### Structure

```
bc-pageWrap bc-pageWide
  bc-pageInner
    bc-pageCard (header card — OUTSIDE helpLayout, stays full-width)
      bc-pageCardHead
        bc-pageCardTitle (entity type heading + entity name subtitle)
        bc-pageCardTools (Back + domain actions + Refresh + Help)
      bc-pageCardFoot (only when state=ready)
        bc-pageCardFootLeft (status pill or type badge)
        bc-pageCardFootRight (Delete button only + inline delete confirmation)
    bc-helpLayout bc-helpLayoutRight [class.is-helpOpen]="showHelp"
      <main>
        bc-card (detail card)
          bc-sectionHead ("Details" label + Edit button)
          bc-cardInner p-4 (Bootstrap grid layout: row g-4 with bc-sub labels)
        bc-card (optional: additional sections like permissions, members, nested tables)
      </main>
      <aside bc-helpPane> (contextual help)
```

### Key Rules

1. **Wide layout:** Always use `bc-pageWide` — same as list and edit screens.

2. **Header title:** `bc-h1` is the entity type ("User", "Group"), `bc-sub` is the specific entity name. Subtitle only renders when the entity is loaded.

3. **Header tools (top-right):** White outline buttons (`btn btn-outline-light bc-iconBtn`). **Button order:** Back (first) → domain actions (Findings, Summarize, Engagements, Edit, etc.) → Refresh → Help (last). Back uses `Location.back()` (browser history), not a hardcoded route.

4. **Footer bar (bc-pageCardFoot):** Only shown when `state === 'ready'`.
   - Left side: Status indicator (e.g. `bc-pillStatus` for active/locked, `bc-typeBadge` for default/custom).
   - Right side: **Delete button only** — no Edit here. Delete shows inline confirmation (same pattern as list screens).
   - Protection: Owner users cannot be deleted (`[disabled]="role === 'owner'"`), default groups cannot be deleted (`[disabled]="is_default"`).

5. **Section header actions pattern:** Each content section gets its own header bar (`bc-sectionHead`) with label (left) and contextual actions (right). Actions are scoped to what they affect:
   - **Page header footer:** Page-level actions only (e.g. Delete engagement — destroys the whole entity and everything under it).
   - **Section headers:** Section-scoped actions (e.g. Edit in Details section, Edit SoW + Refresh in SoW section).
   - This makes each button's scope unambiguous — it lives where its effect is.

6. **Section header structure:**
   ```
   bc-sectionHead (or bc-sowHead, etc.)
     left: h3.bc-sectionLabel + optional badge/status
     right: action buttons (Edit, Delete, Refresh — btn btn-sm)
   ```

7. **Detail display:** Uses Bootstrap grid (`row g-4`) with `bc-sub` labels and plain `div.mt-1` values. Fields laid out in responsive columns (`col-12 col-lg-4` for 3-col, `col-12 col-lg-6` for 2-col). Full-width fields use `col-12`. Within a column, stack multiple fields with `mt-4` divs. Multi-line text fields use `style="white-space:pre-wrap"`. Empty values always use `—` (em dash), never `-` (hyphen). The Edit button lives in the `bc-sectionHead` above the grid, not in the page footer.

8. **State management:** `vm$` observable with states: `init` (loading), `ready` (data loaded), `error` (API failure), `missing` (404). Each state renders different UI (loading message, error alert, not-found warning, or detail cards).

9. **Delete flow:** `confirmingDelete$` BehaviorSubject controls inline confirmation visibility. `deleting$` disables buttons during API call. On success, navigates to list page. On error, resets confirmation and shows toast. The confirmation buttons **must** be wrapped in `<div class="bc-deleteConfirm">` (provides `inline-flex` alignment). Pattern:
   ```html
   <div class="bc-deleteConfirm" *ngIf="confirmingDelete$ | async">
     <span class="bc-sub me-2">Delete entity?</span>
     <button class="btn btn-sm btn-danger bc-btn me-1" [disabled]="deleting$ | async" (click)="deleteEntity(entity)">
       <i class="bi bi-check-lg me-1"></i>Yes
     </button>
     <button class="btn btn-sm btn-outline-light bc-btnSoft" [disabled]="deleting$ | async" (click)="cancelDelete()">
       <i class="bi bi-x-lg me-1"></i>No
     </button>
   </div>
   ```

10. **Help aside:** Same `bc-helpLayout` pattern as other screens. **Header card stays outside the help layout** — it spans full width regardless of help pane state.

11. **Multiple cards:** View screens may have multiple `bc-card` sections (e.g. details + permissions + members). Each gets its own `bc-cardInner p-4`.

### CSS Classes

- `bc-sectionHead` — flex header bar for a card section (label left, actions right), green-tinted border-bottom. Defined in component CSS (not global). Must have `position: relative` to stay above `bc-card::before` overlay.
- `bc-sectionLabel` — Orbitron heading for section headers (global style)
- `bc-sub` — muted label text used for field labels in the grid layout
- `bc-deleteConfirm` — inline-flex wrapper for delete confirmation buttons (defined in component CSS)
- `bc-pillStatus` — status pill with dot indicator (active/locked)
- `bc-pillDot` — colored dot inside status pill

### Component Pattern

```typescript
private readonly location = inject(Location); // from @angular/common

showHelp = false;
readonly confirmingDelete$ = new BehaviorSubject(false);
readonly deleting$ = new BehaviorSubject(false);

goBack(): void { this.location.back(); }
toggleHelp(): void { this.showHelp = !this.showHelp; }
refresh(): void { this.refresh$.next(); }
confirmDelete(): void { this.confirmingDelete$.next(true); }
cancelDelete(): void { this.confirmingDelete$.next(false); }

deleteEntity(entity: T): void {
  this.deleting$.next(true);
  this.service.delete(entity.id).subscribe({
    next: () => { navigate to list; },
    error: () => { reset confirmation; show error toast; },
  });
}

formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { ... });
}
```

### View Reference Implementation

- Engagements view (with nested SoW + scope table): `src/app/features/engagements/engagements-view/`
- Organizations view (with nested assets table): `src/app/features/organizations/organizations-view/`
- Assets view: `src/app/features/assets/assets-view/`
- Users view: `src/app/features/admin/users/users-view/`
- Groups view (with permissions + members sections): `src/app/features/admin/groups/groups-view/`

---

## Nested Tables & Sections Inside Cards

When a `bc-table` is nested inside a `bc-card` (not standalone), apply these fixes in the **component CSS**:

### 1. Remove top corner radius

The global `.bc-table` applies `border-top-left-radius: 14px` and `border-top-right-radius: 14px` on `thead th`. When the table is mid-card, these rounded corners look wrong. Override in component CSS:

```css
.bc-table thead th:first-child {
  border-top-left-radius: 0;
}
.bc-table thead th:last-child {
  border-top-right-radius: 0;
}
```

Bottom corners can keep their radius — they coincide with the card's own border radius.

### 2. Add `position: relative` to elements inside `bc-card` but outside `bc-cardInner`

The `.bc-card::before` pseudo-element creates a glow overlay with `position: absolute; inset: -2px` but no `pointer-events: none`. Elements inside `.bc-cardInner` work because it has `position: relative` (stacks above `::before`). The following elements placed inside `.bc-card` but outside `.bc-cardInner` **must** have `position: relative` or the overlay blocks all mouse interaction (clicks, dropdowns, buttons, links):

- Custom section headers: `.bc-scopeHead`, `.bc-scopeAdd`, `.bc-sowHead`, `.bc-sectionHead`, `.bc-assetsHead`
- `.table-responsive` wrapper around `bc-table`

```css
.bc-scopeHead {
  /* ... layout styles ... */
  position: relative; /* REQUIRED — stacks above .bc-card::before overlay */
}

.table-responsive {
  position: relative; /* REQUIRED — table buttons/links need to be clickable */
}
```

### 3. Nested sub-sections pattern

View/edit screens can nest sub-sections inside a card. Use a divider header (e.g. `bc-scopeHead`, `bc-assetsHead`) with `border-top` to visually separate from content above:

```
bc-card (e.g. SoW card)
  bc-cardInner p-0
    bc-sowHead (section header)
    p-4 (SoW metadata + actions)
    bc-scopeHead (sub-section divider — border-top separates from SoW content)
    table.bc-table (scope assets — read-only on view, editable on edit)
```

Guard sub-sections with `*bcHasPermission` when they have separate permissions (e.g. `scope.view`).

### 4. Inline remove confirmation in tables

Destructive row actions (remove from scope, remove from group, etc.) use inline Yes/No confirmation. The confirmation replaces the action button in the same cell:

```html
<td class="text-end bc-removeCell">
  <ng-container *ngIf="(confirmingRemoveId$ | async) === item.id; else removeBtn">
    <span class="bc-sub me-1">Remove?</span>
    <button class="btn btn-sm btn-danger bc-btn me-1" (click)="removeItem(item.id)">
      <i class="bi bi-check-lg me-1"></i>Yes
    </button>
    <button class="btn btn-sm btn-outline-light bc-btnSoft" (click)="cancelRemove()">
      <i class="bi bi-x-lg me-1"></i>No
    </button>
  </ng-container>
  <ng-template #removeBtn>
    <button class="btn btn-sm btn-outline-danger bc-btnSoft" (click)="confirmRemove(item.id)">
      <i class="bi bi-x-lg"></i>
    </button>
  </ng-template>
</td>
```

Component: `confirmingRemoveId$` BehaviorSubject tracks which row is confirming. `confirmRemove(id)` sets it, `cancelRemove()` clears it, `removeItem(id)` clears it on success/error. Add `.bc-removeCell { white-space: nowrap; }` so confirmation doesn't wrap.

### Reference Implementations

- Engagement view SoW + scope: `src/app/features/engagements/engagements-view/`
- SoW edit with scope management: `src/app/features/engagements/sow-edit/`
- Organization view with assets: `src/app/features/organizations/organizations-view/`
