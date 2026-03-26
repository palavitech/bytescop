import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MentionMembersService } from './mention-members.service';
import { MentionMember } from '../models/comment.model';

const MOCK_MEMBERS: MentionMember[] = [
  { id: 1, display_name: 'John Doe', email: 'john@example.com', avatar_url: null },
  { id: 2, display_name: 'Jane Smith', email: 'jane@example.com', avatar_url: 'https://img.example.com/jane.png' },
];

describe('MentionMembersService', () => {
  let service: MentionMembersService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MentionMembersService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('list() sends GET to /api/authorization/members/ref/', () => {
    service.list().subscribe();
    const req = httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/ref/'));
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_MEMBERS);
  });

  it('list() returns the members array', () => {
    let result: MentionMember[] | undefined;
    service.list().subscribe(r => (result = r));
    httpTesting.expectOne(r => r.url.endsWith('/api/authorization/members/ref/')).flush(MOCK_MEMBERS);
    expect(result).toEqual(MOCK_MEMBERS);
  });

  it('list() makes a fresh HTTP call each time', () => {
    service.list().subscribe();
    service.list().subscribe();

    const reqs = httpTesting.match(r => r.url.endsWith('/api/authorization/members/ref/'));
    expect(reqs.length).toBe(2);
    reqs.forEach(r => r.flush(MOCK_MEMBERS));
  });
});
