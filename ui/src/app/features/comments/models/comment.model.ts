export interface CommentUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
}

export interface Comment {
  id: string;
  body_md: string;
  created_by: CommentUser;
  is_own: boolean;
  edited_at: string | null;
  created_at: string;
  updated_at: string;
  replies: Comment[];
}

export interface CommentCreate {
  body_md: string;
}

export interface MentionMember {
  id: number;
  display_name: string;
  email: string;
  avatar_url: string | null;
}
