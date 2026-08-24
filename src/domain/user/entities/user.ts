// Pure domain shape for a User. Mirrors the DB row today; kept in the
// domain layer so the application can depend on a stable contract rather
// than an ORM-inferred type.
export type User = {
  id: string;
  email: string;
  password: string | null;
  name: string | null;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
};
