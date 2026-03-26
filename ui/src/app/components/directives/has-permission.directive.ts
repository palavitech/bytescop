import {
  Directive,
  Input,
  TemplateRef,
  ViewContainerRef,
  inject,
  OnDestroy,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { PermissionService } from '../../services/core/auth/permission.service';

/**
 * Structural directive that conditionally renders content based on permissions.
 *
 * Usage:
 *   <button *bcHasPermission="'engagement.create'">New Engagement</button>
 *   <a *bcHasPermission="['user.view', 'group.view']">Admin</a>
 *   <ng-container *bcHasPermission="'engagement.update'; else readOnly">...</ng-container>
 *
 * When a string is provided, checks for that single permission.
 * When an array is provided, checks if the user has ANY of the listed permissions.
 * Root users always see the content.
 */
@Directive({
  selector: '[bcHasPermission]',
  standalone: true,
})
export class HasPermissionDirective implements OnDestroy {
  private readonly permissions = inject(PermissionService);
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);

  private subscription: Subscription | null = null;
  private elseTemplateRef: TemplateRef<unknown> | null = null;
  private state: 'main' | 'else' | 'none' = 'none';

  @Input()
  set bcHasPermissionElse(ref: TemplateRef<unknown>) {
    this.elseTemplateRef = ref;
  }

  @Input()
  set bcHasPermission(value: string | string[]) {
    this.subscription?.unsubscribe();

    const codenames = Array.isArray(value) ? value : [value];

    this.subscription = this.permissions.hasAny$(...codenames).subscribe(
      allowed => {
        if (allowed && this.state !== 'main') {
          this.viewContainer.clear();
          this.viewContainer.createEmbeddedView(this.templateRef);
          this.state = 'main';
        } else if (!allowed && this.state !== 'else') {
          this.viewContainer.clear();
          if (this.elseTemplateRef) {
            this.viewContainer.createEmbeddedView(this.elseTemplateRef);
          }
          this.state = 'else';
        }
      },
    );
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }
}
