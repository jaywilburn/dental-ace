// Stub so modules importing "@/lib/prisma" can be unit-tested under Vitest
// without a live DATABASE_URL. Tests that need a real DB should use integration
// test helpers instead.
export const prisma = {} as never;
