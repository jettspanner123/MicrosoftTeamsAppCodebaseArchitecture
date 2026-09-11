import { randomUUID } from "node:crypto";
import { MessageActivityInput, stripMentionsText, TokenCredentials } from "@microsoft/teams.api";
import { App } from "@microsoft/teams.apps";
import { ManagedIdentityCredential } from "@azure/identity";
import config from "./config";
import {
  buildApproverDecidedCard,
  buildApproverPendingCard,
  buildRequestFormCard,
  buildRequesterStatusCard,
} from "./cards";
import { VmRequestRecord } from "./storage";
import { createVmRequest, getUser, getVmRequest, updateVmRequest, upsertUser } from "./storage";
import { isBeforeNowInTimeZone } from "./time";

function cardActionError(message: string) {
  return {
    statusCode: 400,
    type: "application/vnd.microsoft.error",
    value: {
      code: "BadRequest",
      message,
      innerHttpError: {
        statusCode: 400,
        body: { error: message },
      },
    },
  } as const;
}

const createTokenFactory = () => {
  return async (scope: string | string[], tenantId?: string): Promise<string> => {
    const managedIdentityCredential = new ManagedIdentityCredential({
      clientId: process.env.CLIENT_ID,
    });
    const scopes = Array.isArray(scope) ? scope : [scope];
    const tokenResponse = await managedIdentityCredential.getToken(scopes, {
      tenantId: tenantId,
    });

    return tokenResponse.token;
  };
};

// Configure authentication using TokenCredentials
const tokenCredentials: TokenCredentials = {
  clientId: process.env.CLIENT_ID || "",
  token: createTokenFactory(),
};

const credentialOptions =
  config.MicrosoftAppType === "UserAssignedMsi" ? { ...tokenCredentials } : undefined;

const app = new App({
  ...credentialOptions,
  dangerouslyAllowUnauthenticatedRequests: !process.env.CLIENT_ID,
});

// Every inbound activity carries the sender's conversation id, so we use any
// message to keep our own conversation-reference table up to date. This is
// what lets the bot proactively message the approver later, and it's also
// how the approver's very first message "registers" them as a valid target.
async function rememberSender(activity: { from: { aadObjectId?: string; name?: string }; conversation: { id: string } }) {
  const aadObjectId = activity.from.aadObjectId;
  if (!aadObjectId) {
    return;
  }
  await upsertUser({
    partitionKey: "user",
    rowKey: aadObjectId,
    name: activity.from.name || "Unknown",
    conversationId: activity.conversation.id,
  });
}

app.on("message", async ({ activity, send }) => {
  await rememberSender(activity);
  const text: string = stripMentionsText(activity).trim();

  if (text === "/whoami") {
    await send(
      `Name: ${activity.from.name}\nAAD object id: ${activity.from.aadObjectId}\n\n` +
        `Share this id with whoever is configuring the VM-approval bot if you're meant to be the approver.`
    );
    return;
  }

  if (text === "/request-vm") {
    await send(buildRequestFormCard());
    return;
  }

  await send("Type /request-vm to request VM uptime, or /whoami to find your Teams AAD object id.");
});

app.on("card.action.request_vm_submit", async ({ activity, send }) => {
  const data = (activity.value?.action?.data || {}) as {
    vmName?: string;
    fromDate?: string;
    fromTime?: string;
    upTimeHours?: string;
  };

  const vmName = (data.vmName || "").trim();
  const fromDate = data.fromDate || "";
  const fromTime = data.fromTime || "";
  const upTimeHours = Number(data.upTimeHours || "4");

  if (!vmName || !fromDate || !fromTime) {
    return cardActionError("Please fill in VM name, from date and from time.");
  }

  if (isBeforeNowInTimeZone(fromDate, fromTime, config.vmRequestTimeZone)) {
    return cardActionError(
      `That date/time is in the past (${config.vmRequestTimeZone}). Please pick a time in the future.`
    );
  }

  const requesterAadId = activity.from.aadObjectId || "";
  const requesterName = activity.from.name || "Unknown";

  const record: VmRequestRecord = {
    partitionKey: "vmrequest",
    rowKey: randomUUID(),
    requesterAadId,
    requesterName,
    requesterConversationId: activity.conversation.id,
    requesterActivityId: activity.replyToId || activity.id || "",
    vmName,
    fromDate,
    fromTime,
    upTimeHours,
    status: "Pending",
    approverAadId: config.approverAadObjectId,
    decisionNote: "",
    createdAt: new Date().toISOString(),
    decidedAt: "",
  };
  await createVmRequest(record);

  if (!config.approverAadObjectId) {
    await send(
      "Your request was saved, but no approver is configured yet (APPROVER_AAD_OBJECT_ID is empty) - it won't reach anyone until that's set."
    );
  } else {
    const approver = await getUser(config.approverAadObjectId);
    if (!approver) {
      await send(
        "Heads up: the approver hasn't messaged this bot yet, so your request couldn't be delivered to them. " +
          "Ask them to message the bot once (e.g. with /whoami), then submit your request again."
      );
    } else {
      try {
        await app.send(approver.conversationId, buildApproverPendingCard(record));
      } catch (error) {
        console.error("Failed to notify approver of new VM request", error);
        await send(
          "Your request was saved, but delivering it to the approver failed. It's still Pending - ask them to check, or try again shortly."
        );
      }
    }
  }

  return {
    statusCode: 200,
    type: "application/vnd.microsoft.card.adaptive",
    value: buildRequesterStatusCard(record),
  };
});

app.on("card.action.vm_request_decision", async ({ activity, api }) => {
  const data = (activity.value?.action?.data || {}) as {
    requestId?: string;
    decision?: "accept" | "reject";
    note?: string;
  };
  const requestId = data.requestId;
  const decision = data.decision;
  const note = (data.note || "").trim();

  if (!requestId || !decision) {
    return cardActionError("This request could not be read.");
  }

  const record = await getVmRequest(requestId);
  if (!record) {
    return cardActionError("This request no longer exists.");
  }

  if (record.status !== "Pending") {
    return {
      statusCode: 200,
      type: "application/vnd.microsoft.card.adaptive",
      value: buildApproverDecidedCard(record),
    };
  }

  if (decision === "reject" && !note) {
    return cardActionError(
      "Please add a note explaining why you're rejecting this request, then press Reject again."
    );
  }

  record.status = decision === "accept" ? "Accepted" : "Rejected";
  record.decisionNote = note;
  record.decidedAt = new Date().toISOString();
  await updateVmRequest(record);

  if (record.requesterConversationId && record.requesterActivityId) {
    try {
      const updatedActivity = new MessageActivityInput().addCard(
        "adaptive",
        buildRequesterStatusCard(record)
      );
      await api.conversations.activities(record.requesterConversationId).update(
        record.requesterActivityId,
        updatedActivity
      );
    } catch (error) {
      console.error("Failed to update requester's card with the decision", error);
    }
  }

  return {
    statusCode: 200,
    type: "application/vnd.microsoft.card.adaptive",
    value: buildApproverDecidedCard(record),
  };
});

export default app;
