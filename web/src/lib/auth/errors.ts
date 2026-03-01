// Supabase error codes → English user-facing messages
const SUPABASE_ERROR_MAP: Record<string, string> = {
  // Registration
  user_already_exists: "This email address is already in use",
  email_exists: "This email address is already in use",
  "User already registered": "This email address is already in use",

  // Login
  invalid_credentials: "Invalid email or password",
  "Invalid login credentials": "Invalid email or password",

  // Email confirmation
  email_not_confirmed:
    "Your email address has not been confirmed yet. Please check your inbox.",
  "Email not confirmed":
    "Your email address has not been confirmed yet. Please check your inbox.",

  // Password reset
  otp_expired: "This link has expired. Please request a new password reset link.",
  "Token has expired or is invalid":
    "This link has expired or is invalid. Please request a new one.",

  // Password
  same_password: "Your new password cannot be the same as your current password.",
  weak_password:
    "Password is too weak. Use at least 8 characters with letters and numbers.",

  // Rate limiting
  over_email_send_rate_limit:
    "Too many attempts. Please wait a moment and try again.",
  over_request_rate_limit:
    "Too many attempts. Please wait a moment and try again.",

  // Email address
  email_address_invalid: "Invalid email address",
  "Unable to validate email address: invalid format": "Invalid email address",
};

type SupabaseError = {
  message?: string;
  code?: string;
  status?: number;
} | null | undefined;

export function toAuthError(err: SupabaseError): string {
  if (!err) return "An unknown error occurred.";

  if (err.code && SUPABASE_ERROR_MAP[err.code]) {
    return SUPABASE_ERROR_MAP[err.code];
  }

  for (const [key, value] of Object.entries(SUPABASE_ERROR_MAP)) {
    if (err.message?.includes(key)) {
      return value;
    }
  }

  return "A server error occurred. Please try again.";
}
