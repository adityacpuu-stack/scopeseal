import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
const client = createClient({ chain: studionet });
const raw = await client.readContract({
  address: "0x1298f420156D97F6587e81D7E2379815Ce162B05",
  functionName: "get_record",
  transactionHashVariant: "latest-final",
});
const record = JSON.parse(raw);
if (record.phase !== "RESOLVED" || record.resolution !== "SCOPE_MET")
  throw Error("Unexpected live record");
const fees = await client.estimateTransactionFees();
console.log(
  JSON.stringify({
    phase: record.phase,
    resolution: record.resolution,
    criteria: record.criteria.length,
    feeValue: fees.feeValue.toString(),
  }),
);
