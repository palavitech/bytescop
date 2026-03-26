# Permission Guard Rules

Rules for consistent permission enforcement across the BytesCop SaaS UI.

## Route Guards

- **Every route** that displays data or performs actions must have `canActivate: [requirePermission('feature.action')]`.
- List and view routes use `feature.view`; create routes use `feature.create`; edit routes use `feature.update`.
- Parent routes with children can use OR logic (e.g., `requirePermission('user.view', 'group.view')` for `/admin`), but every child route must also have its own specific guard.
- The guard shows a warning toast on denial before redirecting to `/dashboard`.

## Template Directives

- Every action button (Create, Edit, Delete) must use `*bcHasPermission="'feature.action'"` to hide from unauthorized users.
- Navigation items in the sidebar should also use `*bcHasPermission` to avoid showing inaccessible links.

## API 403 Handling

- The `authInterceptor` globally handles 403 responses with an error toast.
- It reads `err.error.detail` from the API response for the message, falling back to a generic message.
- Components do **not** need individual 403 handling — the interceptor covers it.
- The error is still re-thrown so components can handle their own error states (e.g., stop loading spinners).

## Dashboard Empty State

- The dashboard checks `hasAnyFeatureAccess$` (client.view, engagement.view, asset.view, user.view, group.view, finding.view).
- Users with zero permissions see a "No Access" card instead of the welcome message.

## Checklist for New Features

1. Add `canActivate: [requirePermission('feature.view')]` to list/view routes
2. Add `canActivate: [requirePermission('feature.create')]` to create routes
3. Add `canActivate: [requirePermission('feature.update')]` to edit routes
4. Add `*bcHasPermission` to all action buttons in templates
5. Add the view permission to the dashboard's `hasAnyFeatureAccess$` list
6. Add sidebar nav items with `*bcHasPermission` guards
