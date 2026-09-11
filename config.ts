const config = {
  MicrosoftAppId: process.env.CLIENT_ID,
  MicrosoftAppType: process.env.BOT_TYPE,
  MicrosoftAppTenantId: process.env.TENANT_ID,
  MicrosoftAppPassword: process.env.CLIENT_PASSWORD,

  // AAD object id of the person who receives VM requests to approve/reject.
  // Have them message the bot once and use /whoami to find their id.
  approverAadObjectId: process.env.APPROVER_AAD_OBJECT_ID || "",

  // Azure Table Storage connection string. Defaults to the Azurite local
  // emulator so the flow can be built and tested before real Azure access
  // is provisioned; point this at a real storage account connection string
  // in production.
  tableStorageConnectionString:
    process.env.TABLE_STORAGE_CONNECTION_STRING || "UseDevelopmentStorage=true",

  // Wall-clock timezone that from-date/from-time inputs on the VM request
  // form are interpreted in.
  vmRequestTimeZone: "CET",
};

export default config;
