// Browser stand-ins for node:fs and node:path as used by server/database.ts.
// The on-device database is not a file, so there is no directory to create.
export const mkdirSync = () => undefined;
export const dirname = (path: string) =>
  path.replace(/[\\/][^\\/]*$/, "") || ".";
