import { TableClient } from "@azure/data-tables";
import config from "./config";

export type VmRequestStatus = "Pending" | "Accepted" | "Rejected";

export interface VmRequestRecord {
  partitionKey: "vmrequest";
  rowKey: string; // requestId
  requesterAadId: string;
  requesterName: string;
  requesterConversationId: string;
  requesterActivityId: string;
  vmName: string;
  fromDate: string; // YYYY-MM-DD
  fromTime: string; // HH:mm
  upTimeHours: number;
  status: VmRequestStatus;
  approverAadId: string;
  decisionNote: string;
  createdAt: string;
  decidedAt: string;
}

export interface UserRecord {
  partitionKey: "user";
  rowKey: string; // aadObjectId
  name: string;
  conversationId: string;
}

const usersTable = TableClient.fromConnectionString(
  config.tableStorageConnectionString,
  "Users"
);
const vmRequestsTable = TableClient.fromConnectionString(
  config.tableStorageConnectionString,
  "VmRequests"
);

let tablesReady: Promise<void> | undefined;

// Table Storage has no "create if not exists" on the client itself, so we
// lazily create both tables once before the first read/write.
async function ensureTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await usersTable.createTable();
      await vmRequestsTable.createTable();
    })();
  }
  return tablesReady;
}

export async function upsertUser(record: UserRecord): Promise<void> {
  await ensureTables();
  await usersTable.upsertEntity(record, "Merge");
}

export async function getUser(aadObjectId: string): Promise<UserRecord | undefined> {
  await ensureTables();
  try {
    const entity = await usersTable.getEntity<UserRecord>("user", aadObjectId);
    return entity;
  } catch (error: any) {
    if (error?.statusCode === 404) {
      return undefined;
    }
    throw error;
  }
}

export async function createVmRequest(record: VmRequestRecord): Promise<void> {
  await ensureTables();
  await vmRequestsTable.createEntity(record);
}

export async function getVmRequest(requestId: string): Promise<VmRequestRecord | undefined> {
  await ensureTables();
  try {
    const entity = await vmRequestsTable.getEntity<VmRequestRecord>("vmrequest", requestId);
    return entity;
  } catch (error: any) {
    if (error?.statusCode === 404) {
      return undefined;
    }
    throw error;
  }
}

export async function updateVmRequest(record: VmRequestRecord): Promise<void> {
  await ensureTables();
  await vmRequestsTable.updateEntity(record, "Replace");
}
