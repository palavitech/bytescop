import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { of } from 'rxjs';

import { BcCommentInputComponent } from './bc-comment-input.component';
import { MentionMembersService } from '../services/mention-members.service';
import { MentionMember } from '../models/comment.model';

const MOCK_MEMBERS: MentionMember[] = [
  { id: 1, display_name: 'Alice Smith', email: 'alice@example.com', avatar_url: null },
  { id: 2, display_name: 'Bob Jones', email: 'bob@example.com', avatar_url: null },
  { id: 3, display_name: 'Charlie Brown', email: 'charlie@example.com', avatar_url: null },
];

describe('BcCommentInputComponent', () => {
  let component: BcCommentInputComponent;
  let fixture: ComponentFixture<BcCommentInputComponent>;
  let mentionServiceSpy: jasmine.SpyObj<MentionMembersService>;

  beforeEach(() => {
    mentionServiceSpy = jasmine.createSpyObj('MentionMembersService', ['list']);
    mentionServiceSpy.list.and.returnValue(of(MOCK_MEMBERS));

    TestBed.configureTestingModule({
      imports: [BcCommentInputComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MentionMembersService, useValue: mentionServiceSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    fixture = TestBed.createComponent(BcCommentInputComponent);
    component = fixture.componentInstance;
  });

  it('should be created', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  // --- ngOnInit ---

  it('should set text from initialText on init', () => {
    component.initialText = 'Hello world';
    fixture.detectChanges();
    expect(component.text).toBe('Hello world');
  });

  it('should not fetch members on init', () => {
    fixture.detectChanges();
    expect(mentionServiceSpy.list).not.toHaveBeenCalled();
  });

  // --- submit() ---

  it('should emit submitted event with trimmed text', () => {
    fixture.detectChanges();
    component.text = '  Hello world  ';
    const spy = spyOn(component.submitted, 'emit');
    component.submit();
    expect(spy).toHaveBeenCalledWith('Hello world');
  });

  it('should not emit submitted for empty text', () => {
    fixture.detectChanges();
    component.text = '';
    const spy = spyOn(component.submitted, 'emit');
    component.submit();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should not emit submitted for whitespace-only text', () => {
    fixture.detectChanges();
    component.text = '   ';
    const spy = spyOn(component.submitted, 'emit');
    component.submit();
    expect(spy).not.toHaveBeenCalled();
  });

  // --- reset() ---

  it('should clear text, allMembers and close mentions on reset', () => {
    fixture.detectChanges();
    component.text = 'some text';
    component.allMembers = MOCK_MEMBERS;
    component.showMentions = true;
    component.filteredMembers = MOCK_MEMBERS;
    component.mentionIndex = 2;

    component.reset();

    expect(component.text).toBe('');
    expect(component.allMembers).toEqual([]);
    expect(component.showMentions).toBe(false);
    expect(component.filteredMembers).toEqual([]);
    expect(component.mentionIndex).toBe(0);
  });

  // --- onInput() ---

  describe('onInput()', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should return early if textarea element is not available', () => {
      (component as any).textareaRef = undefined;
      component.onInput();
      expect(component.showMentions).toBe(false);
    });

    it('should fetch members on first @ and show dropdown', () => {
      setTextareaValue(fixture, '@');
      component.onInput();
      expect(mentionServiceSpy.list).toHaveBeenCalledTimes(1);
      expect(component.allMembers).toEqual(MOCK_MEMBERS);
      expect(component.showMentions).toBe(true);
      expect(component.filteredMembers.length).toBe(3);
    });

    it('should not re-fetch when members already loaded', () => {
      component.allMembers = MOCK_MEMBERS;
      setTextareaValue(fixture, '@');
      component.onInput();
      expect(mentionServiceSpy.list).not.toHaveBeenCalled();
      expect(component.showMentions).toBe(true);
    });

    it('should filter members by display_name', () => {
      component.allMembers = MOCK_MEMBERS;
      setTextareaValue(fixture, '@ali');
      component.onInput();
      expect(component.showMentions).toBe(true);
      expect(component.filteredMembers.length).toBe(1);
      expect(component.filteredMembers[0].display_name).toBe('Alice Smith');
    });

    it('should filter members by email', () => {
      component.allMembers = MOCK_MEMBERS;
      setTextareaValue(fixture, '@bob');
      component.onInput();
      expect(component.filteredMembers.length).toBe(1);
      expect(component.filteredMembers[0].email).toBe('bob@example.com');
    });

    it('should close mentions when no @ context', () => {
      component.showMentions = true;
      setTextareaValue(fixture, 'no mention here');
      component.onInput();
      expect(component.showMentions).toBe(false);
      expect(component.filteredMembers).toEqual([]);
    });

    it('should reset mentionIndex to 0 on new filter', () => {
      component.allMembers = MOCK_MEMBERS;
      component.mentionIndex = 2;
      setTextareaValue(fixture, '@');
      component.onInput();
      expect(component.mentionIndex).toBe(0);
    });

    it('should limit filtered members to 8', () => {
      const manyMembers: MentionMember[] = [];
      for (let i = 0; i < 15; i++) {
        manyMembers.push({
          id: i,
          display_name: `User${i}`,
          email: `user${i}@example.com`,
          avatar_url: null,
        });
      }
      component.allMembers = manyMembers;

      setTextareaValue(fixture, '@user');
      component.onInput();
      expect(component.filteredMembers.length).toBe(8);
    });

    it('should set showMentions false when filtered result is empty', () => {
      component.allMembers = MOCK_MEMBERS;
      setTextareaValue(fixture, '@zzzzz');
      component.onInput();
      expect(component.showMentions).toBe(false);
      expect(component.filteredMembers.length).toBe(0);
    });

    it('should set mentionStartPos correctly', () => {
      component.allMembers = MOCK_MEMBERS;
      setTextareaValue(fixture, 'Hello @al');
      component.onInput();
      expect((component as any).mentionStartPos).toBe(6);
    });

    it('should re-fetch after reset clears allMembers', () => {
      // First fetch
      setTextareaValue(fixture, '@');
      component.onInput();
      expect(mentionServiceSpy.list).toHaveBeenCalledTimes(1);

      // Reset clears members
      component.reset();
      expect(component.allMembers).toEqual([]);

      // Next @ triggers fresh fetch
      setTextareaValue(fixture, '@');
      component.onInput();
      expect(mentionServiceSpy.list).toHaveBeenCalledTimes(2);
    });
  });

  // --- onKeydown() ---

  describe('onKeydown() with mentions open', () => {
    beforeEach(() => {
      fixture.detectChanges();
      component.showMentions = true;
      component.filteredMembers = MOCK_MEMBERS;
      component.mentionIndex = 0;
    });

    it('should move mentionIndex down on ArrowDown', () => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      spyOn(event, 'preventDefault');
      component.onKeydown(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.mentionIndex).toBe(1);
    });

    it('should clamp mentionIndex at max on ArrowDown', () => {
      component.mentionIndex = 2;
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      spyOn(event, 'preventDefault');
      component.onKeydown(event);
      expect(component.mentionIndex).toBe(2);
    });

    it('should move mentionIndex up on ArrowUp', () => {
      component.mentionIndex = 2;
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      spyOn(event, 'preventDefault');
      component.onKeydown(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.mentionIndex).toBe(1);
    });

    it('should clamp mentionIndex at 0 on ArrowUp', () => {
      component.mentionIndex = 0;
      const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      spyOn(event, 'preventDefault');
      component.onKeydown(event);
      expect(component.mentionIndex).toBe(0);
    });

    it('should select mention on Enter', () => {
      spyOn(component, 'selectMention');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      spyOn(event, 'preventDefault');
      component.onKeydown(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.selectMention).toHaveBeenCalledWith(MOCK_MEMBERS[0]);
    });

    it('should select mention on Tab', () => {
      spyOn(component, 'selectMention');
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      spyOn(event, 'preventDefault');
      component.onKeydown(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.selectMention).toHaveBeenCalledWith(MOCK_MEMBERS[0]);
    });

    it('should not select mention on Enter when filteredMembers is empty', () => {
      component.filteredMembers = [];
      spyOn(component, 'selectMention');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      component.onKeydown(event);
      expect(component.selectMention).not.toHaveBeenCalled();
    });

    it('should close mentions on Escape', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      spyOn(event, 'preventDefault');
      component.onKeydown(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.showMentions).toBe(false);
    });

    it('should return early without processing Ctrl+Enter when mentions are open', () => {
      const spy = spyOn(component.submitted, 'emit');
      component.text = 'some text';
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
      });
      component.onKeydown(event);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('onKeydown() without mentions', () => {
    beforeEach(() => {
      fixture.detectChanges();
      component.showMentions = false;
    });

    it('should submit on Ctrl+Enter', () => {
      component.text = 'Hello';
      spyOn(component, 'submit');
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        ctrlKey: true,
      });
      spyOn(event, 'preventDefault');
      component.onKeydown(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.submit).toHaveBeenCalled();
    });

    it('should submit on Meta+Enter (Cmd+Enter)', () => {
      component.text = 'Hello';
      spyOn(component, 'submit');
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        metaKey: true,
      });
      spyOn(event, 'preventDefault');
      component.onKeydown(event);
      expect(component.submit).toHaveBeenCalled();
    });

    it('should not submit on plain Enter', () => {
      spyOn(component, 'submit');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      component.onKeydown(event);
      expect(component.submit).not.toHaveBeenCalled();
    });

    it('should not submit on Ctrl+A (non-Enter key)', () => {
      spyOn(component, 'submit');
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
      });
      component.onKeydown(event);
      expect(component.submit).not.toHaveBeenCalled();
    });
  });

  // --- selectMention() ---

  describe('selectMention()', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should insert mention text at the correct position', fakeAsync(() => {
      component.text = 'Hello @al';
      (component as any).mentionStartPos = 6;

      const el = component.textareaRef.nativeElement;
      el.value = component.text;
      el.selectionStart = 9;
      el.selectionEnd = 9;

      component.selectMention(MOCK_MEMBERS[0]);

      expect(component.text).toBe('Hello @[Alice Smith](1) ');
      expect(component.showMentions).toBe(false);

      tick();
    }));

    it('should prevent default on mouse event if provided', fakeAsync(() => {
      component.text = '@';
      (component as any).mentionStartPos = 0;

      const el = component.textareaRef.nativeElement;
      el.value = component.text;
      el.selectionStart = 1;
      el.selectionEnd = 1;

      const mouseEvent = new MouseEvent('mousedown');
      spyOn(mouseEvent, 'preventDefault');

      component.selectMention(MOCK_MEMBERS[0], mouseEvent);
      expect(mouseEvent.preventDefault).toHaveBeenCalled();

      tick();
    }));

    it('should handle no event argument', fakeAsync(() => {
      component.text = '@';
      (component as any).mentionStartPos = 0;

      const el = component.textareaRef.nativeElement;
      el.value = component.text;
      el.selectionStart = 1;

      component.selectMention(MOCK_MEMBERS[1]);
      expect(component.text).toContain('@[Bob Jones](2)');

      tick();
    }));

    it('should return early if textarea element is not available', fakeAsync(() => {
      (component as any).textareaRef = undefined;
      component.text = '@al';
      (component as any).mentionStartPos = 0;

      component.selectMention(MOCK_MEMBERS[0]);
      expect(component.text).toBe('@al');

      tick();
    }));

    it('should preserve text after cursor position', fakeAsync(() => {
      component.text = 'Hello @al world';
      (component as any).mentionStartPos = 6;

      const el = component.textareaRef.nativeElement;
      el.value = component.text;
      el.selectionStart = 9;
      el.selectionEnd = 9;

      component.selectMention(MOCK_MEMBERS[0]);
      expect(component.text).toBe('Hello @[Alice Smith](1)  world');

      tick();
    }));
  });

  // --- Template rendering ---

  describe('template', () => {
    function markAndDetect(): void {
      const cdr = fixture.componentRef.injector.get(ChangeDetectorRef);
      cdr.markForCheck();
      fixture.detectChanges();
    }

    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should render a textarea', () => {
      const textarea = fixture.nativeElement.querySelector('textarea');
      expect(textarea).toBeTruthy();
    });

    it('should render submit button with default label', () => {
      const btn = fixture.nativeElement.querySelector('.bc-btnGreen');
      expect(btn.textContent.trim()).toBe('Comment');
    });

    it('should disable submit button when text is empty', () => {
      component.text = '';
      markAndDetect();
      const btn = fixture.nativeElement.querySelector('.bc-btnGreen');
      expect(btn.disabled).toBe(true);
    });

    it('should disable submit button when submitting', () => {
      component.text = 'Hello';
      component.submitting = true;
      markAndDetect();
      const btn = fixture.nativeElement.querySelector('.bc-btnGreen');
      expect(btn.disabled).toBe(true);
    });

    it('should not show cancel button by default', () => {
      const cancelBtn = fixture.nativeElement.querySelector('.bc-btnSoft');
      expect(cancelBtn).toBeNull();
    });

    it('should show cancel button when showCancel is true', () => {
      component.showCancel = true;
      markAndDetect();
      const cancelBtn = fixture.nativeElement.querySelector('.bc-btnSoft');
      expect(cancelBtn).toBeTruthy();
    });

    it('should emit cancelled when cancel button is clicked', () => {
      component.showCancel = true;
      markAndDetect();
      const spy = spyOn(component.cancelled, 'emit');
      const cancelBtn = fixture.nativeElement.querySelector('.bc-btnSoft');
      cancelBtn.click();
      expect(spy).toHaveBeenCalled();
    });

    it('should show mention dropdown when showMentions is true', () => {
      component.showMentions = true;
      component.filteredMembers = MOCK_MEMBERS;
      markAndDetect();
      const dropdown = fixture.nativeElement.querySelector('.bc-mentionDropdown');
      expect(dropdown).toBeTruthy();
    });

    it('should not show mention dropdown when filteredMembers is empty', () => {
      component.showMentions = true;
      component.filteredMembers = [];
      markAndDetect();
      const dropdown = fixture.nativeElement.querySelector('.bc-mentionDropdown');
      expect(dropdown).toBeNull();
    });

    it('should render mention items with display_name and email', () => {
      component.showMentions = true;
      component.filteredMembers = MOCK_MEMBERS;
      markAndDetect();
      const items = fixture.nativeElement.querySelectorAll('.bc-mentionItem');
      expect(items.length).toBe(3);
      expect(items[0].textContent).toContain('Alice Smith');
      expect(items[0].textContent).toContain('alice@example.com');
    });

    it('should mark active mention item', () => {
      component.showMentions = true;
      component.filteredMembers = MOCK_MEMBERS;
      component.mentionIndex = 1;
      markAndDetect();
      const items = fixture.nativeElement.querySelectorAll('.bc-mentionItem');
      expect(items[1].classList.contains('active')).toBe(true);
      expect(items[0].classList.contains('active')).toBe(false);
    });

    it('should use custom submitLabel', () => {
      component.submitLabel = 'Reply';
      markAndDetect();
      const btn = fixture.nativeElement.querySelector('.bc-btnGreen');
      expect(btn.textContent.trim()).toBe('Reply');
    });

    it('should use custom rows', () => {
      component.rows = 5;
      markAndDetect();
      const textarea = fixture.nativeElement.querySelector('textarea');
      expect(textarea.rows).toBe(5);
    });
  });
});

/** Helper to set textarea value and cursor position. */
function setTextareaValue(
  fixture: ComponentFixture<BcCommentInputComponent>,
  value: string,
  cursorPos?: number,
): void {
  const component = fixture.componentInstance;
  component.text = value;
  const el = component.textareaRef?.nativeElement;
  if (el) {
    el.value = value;
    el.selectionStart = cursorPos ?? value.length;
    el.selectionEnd = cursorPos ?? value.length;
  }
}
