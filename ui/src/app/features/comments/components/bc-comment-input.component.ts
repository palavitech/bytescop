import {
  Component, ChangeDetectionStrategy, ChangeDetectorRef, EventEmitter, Input, Output,
  inject, ViewChild, ElementRef, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MentionMembersService } from '../services/mention-members.service';
import { MentionMember } from '../models/comment.model';

@Component({
  selector: 'bc-comment-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './bc-comment-input.component.css',
  template: `
    <div class="bc-commentInput">
      <div class="bc-commentInputWrap">
        <textarea
          #textareaRef
          class="form-control bc-inputDark"
          [rows]="rows"
          [(ngModel)]="text"
          [placeholder]="placeholder"
          (keydown)="onKeydown($event)"
          (input)="onInput()"
        ></textarea>

        <!-- Mention dropdown -->
        <div class="bc-mentionDropdown" *ngIf="showMentions && filteredMembers.length > 0">
          <button
            *ngFor="let m of filteredMembers; let i = index"
            class="bc-mentionItem"
            [class.active]="i === mentionIndex"
            type="button"
            (mousedown)="selectMention(m, $event)"
          >
            <span class="bc-mentionName">{{ m.display_name }}</span>
            <span class="bc-mentionEmail">{{ m.email }}</span>
          </button>
        </div>
      </div>

      <div class="bc-commentInputActions mt-2">
        <button
          class="btn btn-sm bc-btn bc-btnGreen"
          type="button"
          [disabled]="submitting || !text.trim()"
          (click)="submit()"
        >
          {{ submitLabel }}
        </button>
        <button
          *ngIf="showCancel"
          class="btn btn-sm btn-outline-light bc-btnSoft"
          type="button"
          [disabled]="submitting"
          (click)="cancelled.emit()"
        >
          Cancel
        </button>
      </div>
    </div>
  `,
})
export class BcCommentInputComponent implements OnInit {
  @Input() placeholder = 'Write a comment... Use @ to mention someone';
  @Input() submitLabel = 'Comment';
  @Input() showCancel = false;
  @Input() initialText = '';
  @Input() submitting = false;
  @Input() rows = 3;

  @Output() submitted = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('textareaRef') textareaRef!: ElementRef<HTMLTextAreaElement>;

  private readonly mentionService = inject(MentionMembersService);
  private readonly cdr = inject(ChangeDetectorRef);

  text = '';
  allMembers: MentionMember[] = [];
  filteredMembers: MentionMember[] = [];
  showMentions = false;
  mentionIndex = 0;
  private mentionStartPos = -1;
  private fetchPending = false;

  ngOnInit(): void {
    this.text = this.initialText;
  }

  onInput(): void {
    const el = this.textareaRef?.nativeElement;
    if (!el) return;

    const pos = el.selectionStart;
    const before = this.text.substring(0, pos);

    // Check if we're in a mention context (@ followed by word chars, no space before @)
    const mentionMatch = before.match(/@(\w*)$/);
    if (mentionMatch) {
      this.mentionStartPos = pos - mentionMatch[0].length;
      const query = mentionMatch[1].toLowerCase();

      if (this.allMembers.length === 0 && !this.fetchPending) {
        this.fetchPending = true;
        this.mentionService.list().subscribe(members => {
          this.allMembers = members;
          this.fetchPending = false;
          this.filterMembers(query);
          this.cdr.markForCheck();
        });
      } else {
        this.filterMembers(query);
      }
    } else {
      this.closeMentions();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (this.showMentions) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.mentionIndex = Math.min(this.mentionIndex + 1, this.filteredMembers.length - 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.mentionIndex = Math.max(this.mentionIndex - 1, 0);
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        if (this.filteredMembers.length > 0) {
          event.preventDefault();
          this.selectMention(this.filteredMembers[this.mentionIndex]);
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.closeMentions();
      }
      return;
    }

    // Ctrl+Enter or Cmd+Enter to submit
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.submit();
    }
  }

  selectMention(member: MentionMember, event?: MouseEvent): void {
    event?.preventDefault();
    const el = this.textareaRef?.nativeElement;
    if (!el) return;

    const pos = el.selectionStart;
    const before = this.text.substring(0, this.mentionStartPos);
    const after = this.text.substring(pos);
    const mentionText = `@[${member.display_name}](${member.id}) `;

    this.text = before + mentionText + after;
    this.closeMentions();

    // Restore cursor position after the mention
    const newPos = before.length + mentionText.length;
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(newPos, newPos);
    });
  }

  submit(): void {
    const body = this.text.trim();
    if (!body) return;
    this.submitted.emit(body);
  }

  reset(): void {
    this.text = '';
    this.allMembers = [];
    this.closeMentions();
  }

  private filterMembers(query: string): void {
    this.filteredMembers = this.allMembers.filter(m =>
      m.display_name.toLowerCase().includes(query) ||
      m.email.toLowerCase().includes(query),
    ).slice(0, 8);
    this.showMentions = this.filteredMembers.length > 0;
    this.mentionIndex = 0;
  }

  private closeMentions(): void {
    this.showMentions = false;
    this.filteredMembers = [];
    this.mentionIndex = 0;
    this.mentionStartPos = -1;
  }
}
