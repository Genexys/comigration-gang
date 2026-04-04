import type { Db } from "mongodb";

export type AppVariables = {
  db: Db;
  clientIp: string;
};

export type AppEnv = {
  Variables: AppVariables;
};
