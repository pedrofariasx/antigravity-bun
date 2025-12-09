export interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}

export type OpenAIErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'not_found_error'
  | 'rate_limit_error'
  | 'insufficient_quota'
  | 'server_error'
  | 'timeout_error'
  | 'billing_error';

export type OpenAIErrorCode =
  | 'invalid_api_key'
  | 'rate_limit_exceeded'
  | 'model_not_found'
  | 'context_length_exceeded'
  | 'insufficient_quota'
  | 'server_error'
  | 'engine_overloaded'
  | 'timeout'
  | 'content_policy_violation'
  | 'billing_hard_limit_reached'
  | 'invalid_request_error'
  | null;
