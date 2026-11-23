// AI Message types
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  isError?: boolean;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  result?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: AIMessage[];
  createdAt: number;
  updatedAt: number;
}

// Skill template for chat input
export interface SkillTemplate {
  label: string;
  value: string;
  url: string;
  description: string;
  skill: SkillNode[];
}

export interface SkillNode {
  type: 'paragraph';
  children: (CustomText | InputTagNode | SelectTagNode)[];
}

export interface InputTagNode {
  type: 'input-tag';
  label: string;
  children: CustomText[];
}

export interface SelectTagNode {
  type: 'select-tag';
  value: string;
  options: selectTagOption[];
  children: CustomText[];
}

export interface CustomText {
  text: string;
}

export interface selectTagOption {
  label: string;
  value: string;
}
