import {
  AdaptiveCard,
  TextBlock,
  TextInput,
  DateInput,
  TimeInput,
  ChoiceSetInput,
  ActionSet,
  ExecuteAction,
} from "@microsoft/teams.cards";
import { VmRequestRecord, VmRequestStatus } from "./storage";

const UPTIME_CHOICES = [4, 8, 12, 24].map((hours) => ({
  title: `${hours} hours`,
  value: String(hours),
}));

export function buildRequestFormCard(): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock("Request VM uptime", { size: "Large", weight: "Bolder" }),
    new TextBlock(
      "Times are in CET. Fill this in and press Request to send it for approval.",
      { wrap: true, isSubtle: true }
    ),
    new TextInput({ id: "vmName" })
      .withLabel("VM name")
      .withPlaceholder("e.g. dev-jumpbox-01")
      .withIsRequired(true),
    new DateInput({ id: "fromDate" }).withLabel("From date (CET)").withIsRequired(true),
    new TimeInput({ id: "fromTime" }).withLabel("From time (CET)").withIsRequired(true),
    new ChoiceSetInput(...UPTIME_CHOICES)
      .withId("upTimeHours")
      .withLabel("Keep it up for")
      .withValue("4"),
    new ActionSet(
      new ExecuteAction({ title: "Request" })
        .withData({ action: "request_vm_submit" })
        .withAssociatedInputs("auto")
        .withStyle("positive")
    )
  );
}

const STATUS_COLOR: Record<VmRequestStatus, "Good" | "Attention" | "Warning"> = {
  Pending: "Warning",
  Accepted: "Good",
  Rejected: "Attention",
};

function detailBlocks(record: VmRequestRecord): TextBlock[] {
  return [
    new TextBlock(`VM: ${record.vmName}`, { wrap: true, weight: "Bolder" }),
    new TextBlock(
      `From ${record.fromDate} ${record.fromTime} CET, up for ${record.upTimeHours} hours`,
      { wrap: true }
    ),
    new TextBlock(`Requested by ${record.requesterName}`, { wrap: true, isSubtle: true }),
  ];
}

function statusBlocks(record: VmRequestRecord): TextBlock[] {
  const blocks = [
    new TextBlock(record.status, { weight: "Bolder", color: STATUS_COLOR[record.status] }),
  ];
  if (record.decisionNote) {
    blocks.push(new TextBlock(`Note: ${record.decisionNote}`, { wrap: true }));
  }
  return blocks;
}

export function buildRequesterStatusCard(record: VmRequestRecord): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock("VM request", { size: "Large", weight: "Bolder" }),
    ...detailBlocks(record),
    ...statusBlocks(record)
  );
}

export function buildApproverPendingCard(record: VmRequestRecord): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock("VM uptime request", { size: "Large", weight: "Bolder" }),
    ...detailBlocks(record),
    new TextInput({ id: "note" }).withLabel("Note (required if rejecting)").withIsMultiline(true),
    new ActionSet(
      new ExecuteAction({ title: "Accept" })
        .withData({ action: "vm_request_decision", requestId: record.rowKey, decision: "accept" })
        .withAssociatedInputs("auto")
        .withStyle("positive"),
      new ExecuteAction({ title: "Reject" })
        .withData({ action: "vm_request_decision", requestId: record.rowKey, decision: "reject" })
        .withAssociatedInputs("auto")
        .withStyle("destructive")
    )
  );
}

export function buildApproverDecidedCard(record: VmRequestRecord): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock("VM uptime request", { size: "Large", weight: "Bolder" }),
    ...detailBlocks(record),
    ...statusBlocks(record)
  );
}
