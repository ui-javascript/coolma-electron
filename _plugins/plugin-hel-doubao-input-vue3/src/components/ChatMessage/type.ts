export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  status?: 'loading' | 'streaming' | 'done' | 'error';
  error?: string;
}

export interface StreamChunk {
  id: string;
  content: string;
  done: boolean;
}
