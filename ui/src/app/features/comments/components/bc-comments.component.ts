import {
  Component, ChangeDetectionStrategy, Input, inject,
  ChangeDetectorRef, OnInit, OnDestroy, ViewChildren, QueryList,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, switchMap, catchError, of, Subscription, take } from 'rxjs';
import { CommentsService } from '../services/comments.service';
import { Comment } from '../models/comment.model';
import { BcCommentInputComponent } from './bc-comment-input.component';
import { BcCommentItemComponent } from './bc-comment-item.component';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { NotificationService } from '../../../services/core/notify/notification.service';

type CommentsState = 'init' | 'ready' | 'error';

@Component({
  selector: 'bc-comments',
  standalone: true,
  imports: [
    CommonModule, BcCommentInputComponent,
    BcCommentItemComponent, HasPermissionDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bc-comments.component.html',
  styleUrl: './bc-comments.component.css',
})
export class BcCommentsComponent implements OnInit, OnDestroy {
  @Input({ required: true }) targetType!: string;
  @Input({ required: true }) targetId!: string;

  @ViewChildren(BcCommentItemComponent)
  commentItems!: QueryList<BcCommentItemComponent>;

  private readonly commentsService = inject(CommentsService);
  private readonly notify = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);

  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  private sub: Subscription | null = null;
  private scrolledToFragment = false;

  state: CommentsState = 'init';
  comments: Comment[] = [];
  total = 0;
  submitting = false;

  ngOnInit(): void {
    this.sub = this.refresh$.pipe(
      switchMap(() =>
        this.commentsService.list(this.targetType, this.targetId).pipe(
          catchError(() => {
            this.state = 'error';
            this.cdr.markForCheck();
            return of([] as Comment[]);
          }),
        ),
      ),
    ).subscribe(comments => {
      this.comments = comments;
      this.total = comments.reduce((sum, c) => sum + 1 + (c.replies?.length ?? 0), 0);
      this.state = 'ready';
      this.cdr.markForCheck();

      // Scroll to comment if URL has #comment-<id> fragment (e.g. from email link)
      if (!this.scrolledToFragment) {
        this.scrolledToFragment = true;
        this.route.fragment.pipe(take(1)).subscribe(frag => {
          if (frag?.startsWith('comment-')) {
            // Wait one tick for DOM to render
            setTimeout(() => this.scrollToComment(frag), 100);
          }
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  refresh(): void {
    this.refresh$.next();
  }

  onCommentSubmit(body: string, inputRef: BcCommentInputComponent): void {
    this.submitting = true;
    this.cdr.markForCheck();

    this.commentsService.create(this.targetType, this.targetId, { body_md: body }).subscribe({
      next: () => {
        this.submitting = false;
        inputRef.reset();
        this.refresh();
      },
      error: (err) => {
        this.submitting = false;
        this.cdr.markForCheck();
        this.notify.error(err?.error?.detail || 'Failed to post comment.');
      },
    });
  }

  onReply(event: { parentId: string; body: string }): void {
    this.commentsService.reply(
      this.targetType, this.targetId, event.parentId, { body_md: event.body },
    ).subscribe({
      next: () => {
        this.resetItemState(event.parentId, 'reply');
        this.refresh();
      },
      error: (err) => {
        this.resetItemState(event.parentId, 'reply');
        this.notify.error(err?.error?.detail || 'Failed to post reply.');
      },
    });
  }

  onEdit(event: { commentId: string; body: string }): void {
    this.commentsService.update(
      this.targetType, this.targetId, event.commentId, { body_md: event.body },
    ).subscribe({
      next: (updated) => {
        // Update the comment in-place so Angular re-renders immediately
        this.updateCommentInPlace(event.commentId, updated);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.resetItemState(event.commentId, 'edit');
        this.notify.error(err?.error?.detail || 'Failed to edit comment.');
      },
    });
  }

  onDelete(commentId: string): void {
    this.commentsService.delete(this.targetType, this.targetId, commentId).subscribe({
      next: () => this.refresh(),
      error: (err) => {
        this.notify.error(err?.error?.detail || 'Failed to delete comment.');
      },
    });
  }

  trackById(_: number, item: Comment): string {
    return item.id;
  }

  private scrollToComment(fragmentId: string): void {
    const el = document.getElementById(fragmentId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('bc-commentHighlight');
    setTimeout(() => el.classList.remove('bc-commentHighlight'), 3000);
  }

  private resetItemState(commentId: string, mode: 'edit' | 'reply'): void {
    const item = this.commentItems?.find(c => c.comment.id === commentId);
    if (item) {
      mode === 'edit' ? item.resetEdit() : item.resetReply();
    }
  }

  private updateCommentInPlace(commentId: string, updated: Comment): void {
    // Check top-level comments
    const idx = this.comments.findIndex(c => c.id === commentId);
    if (idx !== -1) {
      const existing = this.comments[idx];
      this.comments = [
        ...this.comments.slice(0, idx),
        { ...updated, replies: existing.replies },
        ...this.comments.slice(idx + 1),
      ];
      return;
    }
    // Check replies
    for (let i = 0; i < this.comments.length; i++) {
      const parent = this.comments[i];
      const rIdx = parent.replies?.findIndex(r => r.id === commentId) ?? -1;
      if (rIdx !== -1) {
        const newReplies = [...parent.replies];
        newReplies[rIdx] = { ...updated, replies: [] };
        this.comments = [
          ...this.comments.slice(0, i),
          { ...parent, replies: newReplies },
          ...this.comments.slice(i + 1),
        ];
        return;
      }
    }
  }
}
