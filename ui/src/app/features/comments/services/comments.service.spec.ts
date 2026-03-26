import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CommentsService } from './comments.service';
import { Comment, CommentCreate } from '../models/comment.model';

const MOCK_COMMENT: Comment = {
  id: 'c-1',
  body_md: 'Test comment body',
  created_by: {
    id: 1,
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    avatar_url: null,
  },
  is_own: true,
  edited_at: null,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  replies: [],
};

describe('CommentsService', () => {
  let service: CommentsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CommentsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // --- list ---

  it('list() sends GET to /api/<targetType>s/<targetId>/comments/', () => {
    service.list('engagement', 'eng-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/comments/'));
    expect(req.request.method).toBe('GET');
    req.flush([MOCK_COMMENT]);
  });

  it('list() returns the comments array', () => {
    let result: Comment[] | undefined;
    service.list('engagement', 'eng-1').subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/comments/')).flush([MOCK_COMMENT]);
    expect(result).toEqual([MOCK_COMMENT]);
  });

  // --- create ---

  it('create() sends POST to /api/<targetType>s/<targetId>/comments/', () => {
    const payload: CommentCreate = { body_md: 'New comment' };
    service.create('engagement', 'eng-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/comments/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_COMMENT);
  });

  it('create() returns the created comment', () => {
    let result: Comment | undefined;
    const payload: CommentCreate = { body_md: 'New comment' };
    service.create('engagement', 'eng-1', payload).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/comments/')).flush(MOCK_COMMENT);
    expect(result).toEqual(MOCK_COMMENT);
  });

  // --- reply ---

  it('reply() sends POST to /api/<targetType>s/<targetId>/comments/<commentId>/reply/', () => {
    const payload: CommentCreate = { body_md: 'Reply text' };
    service.reply('engagement', 'eng-1', 'c-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/comments/c-1/reply/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_COMMENT);
  });

  it('reply() returns the created reply comment', () => {
    let result: Comment | undefined;
    const payload: CommentCreate = { body_md: 'Reply text' };
    service.reply('engagement', 'eng-1', 'c-1', payload).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/comments/c-1/reply/')).flush(MOCK_COMMENT);
    expect(result).toEqual(MOCK_COMMENT);
  });

  // --- update ---

  it('update() sends PATCH to /api/<targetType>s/<targetId>/comments/<commentId>/', () => {
    const payload: CommentCreate = { body_md: 'Updated body' };
    service.update('engagement', 'eng-1', 'c-1', payload).subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/comments/c-1/'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual(payload);
    req.flush(MOCK_COMMENT);
  });

  it('update() returns the updated comment', () => {
    let result: Comment | undefined;
    const payload: CommentCreate = { body_md: 'Updated body' };
    service.update('engagement', 'eng-1', 'c-1', payload).subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/comments/c-1/')).flush(MOCK_COMMENT);
    expect(result).toEqual(MOCK_COMMENT);
  });

  // --- delete ---

  it('delete() sends DELETE to /api/<targetType>s/<targetId>/comments/<commentId>/', () => {
    service.delete('engagement', 'eng-1', 'c-1').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/engagements/eng-1/comments/c-1/'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // --- URL building with different target types ---

  it('builds correct URL for finding target type', () => {
    service.list('finding', 'f-42').subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/findings/f-42/comments/'));
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });
});
