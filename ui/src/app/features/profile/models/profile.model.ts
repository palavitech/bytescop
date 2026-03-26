export interface ProfileResponse {
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    timezone: string;
    avatar_url: string | null;
  };
  role: string | null;
  member_since: string | null;
}

export interface AvatarResponse {
  avatar_url: string;
}
