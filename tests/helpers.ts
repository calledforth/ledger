import { getDb } from "@/db/client";
export const db = () => getDb();
let n = 0;
export const msgId = (p = "hdfc") => `${p}-${Date.now()}-${++n}`;
