CREATE TYPE "public"."token_purpose" AS ENUM('email_verification', 'password_reset', 'account_restore');--> statement-breakpoint
ALTER TABLE "user_verification_codes" ADD COLUMN "purpose" "token_purpose" DEFAULT 'email_verification' NOT NULL;--> statement-breakpoint
CREATE INDEX "user_verification_codes_purpose_idx" ON "user_verification_codes" USING btree ("purpose");