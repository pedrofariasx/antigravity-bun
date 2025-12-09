export interface AntigravityResponse {
  response: {
    responseId?: string;
    candidates: AntigravityCandidate[];
    usageMetadata?: AntigravityUsageMetadata;
  };
}

export interface AntigravityCandidate {
  content: {
    parts: AntigravityResponsePart[];
    role?: string;
  };
  finishReason?: string;
  safetyRatings?: Array<{
    category: string;
    probability: string;
  }>;
}

export interface AntigravityResponsePart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
}

export interface AntigravityUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount?: number;
  totalTokenCount: number;
}

export interface AntigravityStreamChunk {
  response: {
    candidates?: AntigravityCandidate[];
    usageMetadata?: AntigravityUsageMetadata;
  };
}

export interface AntigravityError {
  error: {
    code: number;
    message: string;
    status?: string;
    details?: Array<{
      '@type': string;
      reason?: string;
      metadata?: Record<string, string>;
      retryDelay?: string;
    }>;
  };
}
