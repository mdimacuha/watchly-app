import { db } from "@/db";
import { userPreferences, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function isEmailExisting(email: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  return !!user;
}

export async function isUsernameExisting(username: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  });
  return !!user;
}

export async function isUserOnboarded(userId: string) {
  const user = await db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });
  return user?.onboardingCompleted;
}