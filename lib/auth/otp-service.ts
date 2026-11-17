import crypto from "crypto"
import type { IUser } from "@/lib/models/User"

export type OtpChannel = "email" | "whatsapp"
export type OtpPurpose = "account_verification" | "password_reset"

export interface SendOtpOptions {
  to: string
  channel: OtpChannel
  code: string
  purpose: OtpPurpose
  recipientName?: string
}

export interface DispatchResult {
  success: boolean
  channel: OtpChannel
  recipient: string
  code: string
  dispatchedAt: Date
  previewCode?: string
  error?: string
}

/**
 * Generate a cryptographically secure 6-digit numeric OTP code.
 */
export function generateNumericOtp(length: number = 6): string {
  const min = Math.pow(10, length - 1)
  const max = Math.pow(10, length) - 1
  return crypto.randomInt(min, max + 1).toString()
}

export { dispatchOtpNotification } from "./otp-dispatch"
import { dispatchOtpNotification } from "./otp-dispatch"

/**
 * Assign and dispatch an OTP to a User model for verification or password reset.
 */
export async function createAndSendUserOtp(
  user: IUser,
  channel: OtpChannel,
  purpose: OtpPurpose
): Promise<DispatchResult> {
  const code = generateNumericOtp(6)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

  if (purpose === "password_reset") {
    user.passwordResetOtp = code
    user.passwordResetOtpExpires = expiresAt
    user.passwordResetChannel = channel
  } else if (channel === "email") {
    user.emailVerificationOtp = code
    user.emailVerificationOtpExpires = expiresAt
  } else if (channel === "whatsapp") {
    user.whatsappVerificationCode = code
    user.whatsappVerificationExpires = expiresAt
  }

  await user.save()

  const destination = channel === "email" ? user.email : user.phone || ""
  return await dispatchOtpNotification({
    to: destination,
    channel,
    code,
    purpose,
    recipientName: `${user.firstName} ${user.lastName}`.trim(),
  })
}

/**
 * Verify a given OTP against a user model record.
 */
export function verifyUserOtp(
  user: IUser,
  channel: OtpChannel,
  code: string,
  purpose: OtpPurpose
): { valid: boolean; error?: string } {
  const cleanCode = (code || "").trim()
  const now = new Date()

  if (purpose === "password_reset") {
    if (!user.passwordResetOtp || user.passwordResetOtp !== cleanCode) {
      return { valid: false, error: "Invalid password reset verification code. Please check and try again." }
    }
    if (user.passwordResetOtpExpires && user.passwordResetOtpExpires < now) {
      return { valid: false, error: "Password reset code has expired. Please request a new code." }
    }
    return { valid: true }
  }

  if (channel === "email") {
    if (!user.emailVerificationOtp || user.emailVerificationOtp !== cleanCode) {
      return { valid: false, error: "Invalid email verification code. Please check and try again." }
    }
    if (user.emailVerificationOtpExpires && user.emailVerificationOtpExpires < now) {
      return { valid: false, error: "Email verification code has expired. Please request a new code." }
    }
    return { valid: true }
  }

  if (channel === "whatsapp") {
    if (!user.whatsappVerificationCode || user.whatsappVerificationCode !== cleanCode) {
      return { valid: false, error: "Invalid WhatsApp verification code. Please check and try again." }
    }
    if (user.whatsappVerificationExpires && user.whatsappVerificationExpires < now) {
      return { valid: false, error: "WhatsApp verification code has expired. Please request a new code." }
    }
    return { valid: true }
  }

  return { valid: false, error: "Unsupported verification channel." }
}
