import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';

import { BcCommentItemComponent } from './bc-comment-item.component';
import { Comment, CommentUser } from '../models/comment.model';
import { PermissionService } from '../../../services/core/auth/permission.service';

const MOCK_USER: CommentUser = {
  id: 1,
  first_name: 'John',
  last_name: 'Doe',
  email: 'john@example.com',
  avatar_url: null,
};

const MOCK_COMMENT: Comment = {
  id: 'comment-1',
  body_md: 'Hello world',
  created_by: MOCK_USER,
  is_own: true,
  edited_at: null,
  created_at: '2025-01-01T12:00:00Z',
  updated_at: '2025-01-01T12:00:00Z',
  replies: [],
};

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return { ...MOCK_COMMENT, ...overrides };
}

describe('BcCommentItemComponent', () => {
  let component: BcCommentItemComponent;
  let fixture: ComponentFixture<BcCommentItemComponent>;

  beforeEach(() => {
    sessionStorage.clear();

    TestBed.configureTestingModule({
      imports: [BcCommentItemComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    // Grant all permissions so template directives render
    const permissions = TestBed.inject(PermissionService);
    permissions.setFromAuthResponse({
      is_root: true,
      permissions: [],
      groups: [],
    });

    fixture = TestBed.createComponent(BcCommentItemComponent);
    component = fixture.componentInstance;
    component.comment = MOCK_COMMENT;
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should be created', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // --- initials getter ---

  describe('initials', () => {
    it('should return uppercase initials from first and last name', () => {
      component.comment = makeComment({
        created_by: { ...MOCK_USER, first_name: 'Jane', last_name: 'Smith' },
      });
      expect(component.initials).toBe('JS');
    });

    it('should return single initial when last_name is empty', () => {
      component.comment = makeComment({
        created_by: { ...MOCK_USER, first_name: 'Alice', last_name: '' },
      });
      expect(component.initials).toBe('A');
    });

    it('should return single initial when first_name is empty', () => {
      component.comment = makeComment({
        created_by: { ...MOCK_USER, first_name: '', last_name: 'Brown' },
      });
      expect(component.initials).toBe('B');
    });

    it('should return ? when both names are empty', () => {
      component.comment = makeComment({
        created_by: { ...MOCK_USER, first_name: '', last_name: '' },
      });
      expect(component.initials).toBe('?');
    });

    it('should handle null-ish first_name via optional chaining', () => {
      component.comment = makeComment({
        created_by: { ...MOCK_USER, first_name: null as any, last_name: 'Doe' },
      });
      expect(component.initials).toBe('D');
    });

    it('should handle null-ish last_name via optional chaining', () => {
      component.comment = makeComment({
        created_by: { ...MOCK_USER, first_name: 'John', last_name: null as any },
      });
      expect(component.initials).toBe('J');
    });
  });

  // --- startEdit() ---

  describe('startEdit()', () => {
    it('should set editing to true', () => {
      component.startEdit();
      expect(component.editing).toBe(true);
    });

    it('should reset confirmingDelete', () => {
      component.confirmingDelete = true;
      component.startEdit();
      expect(component.confirmingDelete).toBe(false);
    });
  });

  // --- cancelEdit() ---

  describe('cancelEdit()', () => {
    it('should set editing to false', () => {
      component.editing = true;
      component.cancelEdit();
      expect(component.editing).toBe(false);
    });
  });

  // --- saveEdit() ---

  describe('saveEdit()', () => {
    it('should set saving to true', () => {
      component.saveEdit('updated text');
      expect(component.saving).toBe(true);
    });

    it('should emit edited event with commentId and body', () => {
      const spy = spyOn(component.edited, 'emit');
      component.saveEdit('updated text');
      expect(spy).toHaveBeenCalledWith({
        commentId: 'comment-1',
        body: 'updated text',
      });
    });
  });

  // --- submitReply() ---

  describe('submitReply()', () => {
    it('should set replySubmitting to true', () => {
      component.submitReply('my reply');
      expect(component.replySubmitting).toBe(true);
    });

    it('should emit replied event with parentId and body', () => {
      const spy = spyOn(component.replied, 'emit');
      component.submitReply('my reply');
      expect(spy).toHaveBeenCalledWith({
        parentId: 'comment-1',
        body: 'my reply',
      });
    });
  });

  // --- doDelete() ---

  describe('doDelete()', () => {
    it('should emit deleted event with comment id', () => {
      const spy = spyOn(component.deleted, 'emit');
      component.doDelete();
      expect(spy).toHaveBeenCalledWith('comment-1');
    });
  });

  // --- trackById() ---

  describe('trackById()', () => {
    it('should return item id', () => {
      const result = component.trackById(0, MOCK_COMMENT);
      expect(result).toBe('comment-1');
    });
  });

  // --- resetEdit() ---

  describe('resetEdit()', () => {
    it('should set editing and saving to false', () => {
      component.editing = true;
      component.saving = true;
      component.resetEdit();
      expect(component.editing).toBe(false);
      expect(component.saving).toBe(false);
    });
  });

  // --- resetReply() ---

  describe('resetReply()', () => {
    it('should set replying and replySubmitting to false', () => {
      component.replying = true;
      component.replySubmitting = true;
      component.resetReply();
      expect(component.replying).toBe(false);
      expect(component.replySubmitting).toBe(false);
    });
  });

  // --- Template rendering ---

  describe('template', () => {
    it('should show initials fallback when avatar_url is null', () => {
      fixture.detectChanges();
      const fallback = fixture.nativeElement.querySelector('.bc-avatarFallback');
      expect(fallback).toBeTruthy();
      expect(fallback.textContent.trim()).toBe('JD');
    });

    it('should show avatar image when avatar_url is set', () => {
      component.comment = makeComment({
        created_by: { ...MOCK_USER, avatar_url: '/avatar.png' },
      });
      fixture.detectChanges();
      const img = fixture.nativeElement.querySelector('.bc-avatar');
      expect(img).toBeTruthy();
    });

    it('should display author name', () => {
      fixture.detectChanges();
      const author = fixture.nativeElement.querySelector('.bc-commentAuthor');
      expect(author.textContent).toContain('John');
      expect(author.textContent).toContain('Doe');
    });

    it('should show (edited) badge when edited_at is set', () => {
      component.comment = makeComment({ edited_at: '2025-01-02T12:00:00Z' });
      fixture.detectChanges();
      const edited = fixture.nativeElement.querySelector('.bc-commentEdited');
      expect(edited).toBeTruthy();
      expect(edited.textContent).toContain('edited');
    });

    it('should not show (edited) badge when edited_at is null', () => {
      fixture.detectChanges();
      const edited = fixture.nativeElement.querySelector('.bc-commentEdited');
      expect(edited).toBeNull();
    });

    it('should show Reply button when not a reply and canReply is true', () => {
      component.isReply = false;
      component.canReply = true;
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.bc-btnGhost');
      const replyBtn = Array.from(btns).find(
        (b: any) => b.textContent.includes('Reply'),
      );
      expect(replyBtn).toBeTruthy();
    });

    it('should not show Reply button when isReply is true', () => {
      component.isReply = true;
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.bc-btnGhost');
      const replyBtn = Array.from(btns).find(
        (b: any) => b.textContent.includes('Reply'),
      );
      expect(replyBtn).toBeFalsy();
    });

    it('should not show Reply button when canReply is false', () => {
      component.canReply = false;
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.bc-btnGhost');
      const replyBtn = Array.from(btns).find(
        (b: any) => b.textContent.includes('Reply'),
      );
      expect(replyBtn).toBeFalsy();
    });

    it('should show Delete button for own comment', () => {
      component.comment = makeComment({ is_own: true });
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.bc-btnGhostDanger');
      expect(btns.length).toBeGreaterThan(0);
      expect(btns[0].textContent).toContain('Delete');
    });

    it('should toggle confirmingDelete on first delete click', () => {
      component.comment = makeComment({ is_own: true });
      fixture.detectChanges();
      const deleteBtn = fixture.nativeElement.querySelector('.bc-btnGhostDanger');
      deleteBtn.click();
      expect(component.confirmingDelete).toBe(true);
    });

    it('should call doDelete on second delete click (confirm)', () => {
      component.comment = makeComment({ is_own: true });
      component.confirmingDelete = true;
      fixture.detectChanges();
      const spy = spyOn(component.deleted, 'emit');
      const deleteBtn = fixture.nativeElement.querySelector('.bc-btnGhostDanger');
      deleteBtn.click();
      expect(spy).toHaveBeenCalledWith('comment-1');
    });

    it('should show Cancel button when confirmingDelete is true for own comment', () => {
      component.comment = makeComment({ is_own: true });
      component.confirmingDelete = true;
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.bc-btnGhost');
      const cancelBtn = Array.from(btns).find(
        (b: any) => b.textContent.trim() === 'Cancel',
      );
      expect(cancelBtn).toBeTruthy();
    });

    it('should reset confirmingDelete when cancel button is clicked', () => {
      component.comment = makeComment({ is_own: true });
      component.confirmingDelete = true;
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.bc-btnGhost');
      const cancelBtn = Array.from(btns).find(
        (b: any) => b.textContent.trim() === 'Cancel',
      ) as HTMLButtonElement;
      cancelBtn.click();
      expect(component.confirmingDelete).toBe(false);
    });

    it('should show edit form when editing is true', () => {
      component.editing = true;
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('bc-comment-input');
      expect(input).toBeTruthy();
    });

    it('should hide comment text when editing', () => {
      component.editing = true;
      fixture.detectChanges();
      const text = fixture.nativeElement.querySelector('.bc-commentText');
      expect(text).toBeNull();
    });

    it('should show reply input when replying and not a reply', () => {
      component.replying = true;
      component.isReply = false;
      fixture.detectChanges();
      const inputs = fixture.nativeElement.querySelectorAll('bc-comment-input');
      expect(inputs.length).toBeGreaterThan(0);
    });

    it('should not show reply input when replying but isReply is true', () => {
      component.replying = true;
      component.isReply = true;
      fixture.detectChanges();
      // Only reply inputs would have placeholder "Write a reply..."
      // But since isReply=true, that block should not render
      const inputs = fixture.nativeElement.querySelectorAll('bc-comment-input');
      // There should be no reply input (but there could be edit input if editing)
      expect(component.editing).toBe(false);
      expect(inputs.length).toBe(0);
    });

    it('should apply bc-commentReply class when isReply is true', () => {
      component.isReply = true;
      fixture.detectChanges();
      const el = fixture.nativeElement.querySelector('.bc-commentReply');
      expect(el).toBeTruthy();
    });

    it('should not apply bc-commentReply class when isReply is false', () => {
      component.isReply = false;
      fixture.detectChanges();
      const el = fixture.nativeElement.querySelector('.bc-commentReply');
      expect(el).toBeNull();
    });

    it('should render replies when comment has replies', () => {
      const reply: Comment = {
        ...MOCK_COMMENT,
        id: 'reply-1',
        body_md: 'A reply',
        replies: [],
      };
      component.comment = makeComment({ replies: [reply] });
      component.isReply = false;
      fixture.detectChanges();
      const replies = fixture.nativeElement.querySelector('.bc-replies');
      expect(replies).toBeTruthy();
    });

    it('should not render replies section when replies is empty', () => {
      component.comment = makeComment({ replies: [] });
      fixture.detectChanges();
      const replies = fixture.nativeElement.querySelector('.bc-replies');
      expect(replies).toBeNull();
    });

    it('should not render replies section when isReply is true', () => {
      const reply: Comment = {
        ...MOCK_COMMENT,
        id: 'reply-1',
        replies: [],
      };
      component.comment = makeComment({ replies: [reply] });
      component.isReply = true;
      fixture.detectChanges();
      const replies = fixture.nativeElement.querySelector('.bc-replies');
      expect(replies).toBeNull();
    });

    it('should set replying to true when Reply button is clicked', () => {
      component.isReply = false;
      component.canReply = true;
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.bc-btnGhost');
      const replyBtn = Array.from(btns).find(
        (b: any) => b.textContent.includes('Reply'),
      ) as HTMLButtonElement;
      replyBtn.click();
      expect(component.replying).toBe(true);
    });

    it('should show Confirm text on delete button when confirmingDelete', () => {
      component.comment = makeComment({ is_own: true });
      component.confirmingDelete = true;
      fixture.detectChanges();
      const deleteBtn = fixture.nativeElement.querySelector('.bc-btnGhostDanger');
      expect(deleteBtn.textContent).toContain('Confirm');
    });

    it('should show Delete text on delete button when not confirming', () => {
      component.comment = makeComment({ is_own: true });
      component.confirmingDelete = false;
      fixture.detectChanges();
      const deleteBtn = fixture.nativeElement.querySelector('.bc-btnGhostDanger');
      expect(deleteBtn.textContent).toContain('Delete');
    });

    it('should show delete button for non-own comment (admin delete)', () => {
      component.comment = makeComment({ is_own: false });
      fixture.detectChanges();
      const btns = fixture.nativeElement.querySelectorAll('.bc-btnGhostDanger');
      expect(btns.length).toBeGreaterThan(0);
    });
  });
});
