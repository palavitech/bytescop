import {
  Component, ChangeDetectionStrategy, EventEmitter,
  Input, Output, ChangeDetectorRef, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Comment } from '../models/comment.model';
import { BcDatePipe } from '../../../components/pipes/bc-date.pipe';
import { MentionRenderPipe } from './mention-render.pipe';
import { BcCommentInputComponent } from './bc-comment-input.component';
import { HasPermissionDirective } from '../../../components/directives/has-permission.directive';
import { SecureImagePipe } from '../../../components/pipes/secure-image.pipe';

@Component({
  selector: 'bc-comment-item',
  standalone: true,
  imports: [
    CommonModule, BcDatePipe, MentionRenderPipe,
    BcCommentInputComponent, HasPermissionDirective, SecureImagePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './bc-comment-item.component.css',
  template: `
    <div class="bc-comment" [class.bc-commentReply]="isReply" [attr.id]="'comment-' + comment.id">
      <div class="bc-commentAvatar">
        <img
          *ngIf="comment.created_by.avatar_url"
          [src]="comment.created_by.avatar_url | secureImage | async"
          alt=""
          class="bc-avatar"
        />
        <span *ngIf="!comment.created_by.avatar_url" class="bc-avatarFallback">
          {{ initials }}
        </span>
      </div>

      <div class="bc-commentBody">
        <div class="bc-commentMeta">
          <span class="bc-commentAuthor">
            {{ comment.created_by.first_name }} {{ comment.created_by.last_name }}
          </span>
          <span class="bc-commentTime">{{ comment.created_at | bcDate:'datetime' }}</span>
          <span class="bc-commentEdited" *ngIf="comment.edited_at">(edited)</span>
        </div>

        <!-- View mode -->
        <ng-container *ngIf="!editing">
          <div class="bc-commentText" [innerHTML]="comment.body_md | bcMentionRender"></div>

          <div class="bc-commentActions">
            <button
              *ngIf="!isReply && canReply"
              class="bc-btnGhost"
              type="button"
              (click)="replying = true"
              [class.d-none]="replying"
            >
              <i class="bi bi-reply"></i> Reply
            </button>
            <ng-container *ngIf="comment.is_own">
              <button
                *bcHasPermission="'comment.edit'"
                class="bc-btnGhost"
                type="button"
                (click)="startEdit()"
              >
                <i class="bi bi-pencil"></i> Edit
              </button>
              <button
                class="bc-btnGhost bc-btnGhostDanger"
                type="button"
                (click)="confirmingDelete ? doDelete() : confirmingDelete = true"
              >
                <i class="bi" [class.bi-trash3]="!confirmingDelete" [class.bi-check-lg]="confirmingDelete"></i>
                {{ confirmingDelete ? 'Confirm' : 'Delete' }}
              </button>
              <button
                *ngIf="confirmingDelete"
                class="bc-btnGhost"
                type="button"
                (click)="confirmingDelete = false"
              >
                Cancel
              </button>
            </ng-container>
            <ng-container *ngIf="!comment.is_own">
              <button
                *bcHasPermission="'comment.delete'"
                class="bc-btnGhost bc-btnGhostDanger"
                type="button"
                (click)="confirmingDelete ? doDelete() : confirmingDelete = true"
              >
                <i class="bi" [class.bi-trash3]="!confirmingDelete" [class.bi-check-lg]="confirmingDelete"></i>
                {{ confirmingDelete ? 'Confirm' : 'Delete' }}
              </button>
              <button
                *ngIf="confirmingDelete"
                class="bc-btnGhost"
                type="button"
                (click)="confirmingDelete = false"
              >
                Cancel
              </button>
            </ng-container>
          </div>
        </ng-container>

        <!-- Edit mode -->
        <ng-container *ngIf="editing">
          <bc-comment-input
            [initialText]="comment.body_md"
            [showCancel]="true"
            [submitting]="saving"
            submitLabel="Save"
            placeholder="Edit your comment..."
            [rows]="2"
            (submitted)="saveEdit($event)"
            (cancelled)="cancelEdit()"
          ></bc-comment-input>
        </ng-container>

        <!-- Reply input -->
        <ng-container *ngIf="replying && !isReply">
          <div class="mt-2"></div>
          <bc-comment-input
            [showCancel]="true"
            [submitting]="replySubmitting"
            submitLabel="Reply"
            placeholder="Write a reply..."
            [rows]="2"
            (submitted)="submitReply($event)"
            (cancelled)="replying = false"
          ></bc-comment-input>
        </ng-container>

        <!-- Replies -->
        <ng-container *ngIf="!isReply && comment.replies?.length">
          <div class="bc-replies">
            <bc-comment-item
              *ngFor="let reply of comment.replies"
              [comment]="reply"
              [isReply]="true"
              [canReply]="false"
              (deleted)="deleted.emit($event)"
              (edited)="edited.emit($event)"
            ></bc-comment-item>
          </div>
        </ng-container>
      </div>
    </div>
  `,
})
export class BcCommentItemComponent {
  @Input() comment!: Comment;
  @Input() isReply = false;
  @Input() canReply = true;

  @Output() replied = new EventEmitter<{ parentId: string; body: string }>();
  @Output() edited = new EventEmitter<{ commentId: string; body: string }>();
  @Output() deleted = new EventEmitter<string>();

  private readonly cdr = inject(ChangeDetectorRef);

  editing = false;
  saving = false;
  replying = false;
  replySubmitting = false;
  confirmingDelete = false;

  get initials(): string {
    const f = this.comment.created_by.first_name?.[0] ?? '';
    const l = this.comment.created_by.last_name?.[0] ?? '';
    return (f + l).toUpperCase() || '?';
  }

  startEdit(): void {
    this.editing = true;
    this.confirmingDelete = false;
  }

  cancelEdit(): void {
    this.editing = false;
  }

  saveEdit(body: string): void {
    this.saving = true;
    this.cdr.markForCheck();
    this.edited.emit({ commentId: this.comment.id, body });
  }

  submitReply(body: string): void {
    this.replySubmitting = true;
    this.cdr.markForCheck();
    this.replied.emit({ parentId: this.comment.id, body });
  }

  doDelete(): void {
    this.deleted.emit(this.comment.id);
  }

  trackById(_: number, item: Comment): string {
    return item.id;
  }

  /** Called by parent after successful edit to reset state */
  resetEdit(): void {
    this.editing = false;
    this.saving = false;
    this.cdr.markForCheck();
  }

  /** Called by parent after successful reply to reset state */
  resetReply(): void {
    this.replying = false;
    this.replySubmitting = false;
    this.cdr.markForCheck();
  }
}
