export interface Version {
  id: number;
  game_id: string;
  version_num: number;
  git_tag: string;
  deployed_by: string;
  deployed_at: string;
  status: 'deploying' | 'live' | 'failed' | 'rolled_back';
  is_rollback: boolean;
  rollback_to: number | null;
  file_size_kb: number | null;
}

export interface Game {
  id: string;
  name: string;
  user_name: string;
  tags: string[];
  cover_url: string | null;
  www_path: string;
  created_at: string;
  locked: boolean;
}

export interface LogMessage {
  message: string;
  time?: string;
  done?: boolean;
  ok?: boolean;
  gameId?: string;
}