import type { Db } from "mongodb";

export type AppVariables = {
  db: Db;
};

export type AppEnv = {
  Variables: AppVariables;
};
