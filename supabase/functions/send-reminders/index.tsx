import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js"

serve(async () => {

const supabase = createClient(
Deno.env.get("SUPABASE_URL")!,
Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const { data } = await supabase
.from("repayment_schedules")
.select("*")
.eq("status","overdue")

for (const loan of data || []) {

console.log("Send reminder for", loan.loan_id)

}

return new Response(
JSON.stringify({ success: true }),
{ headers: { "Content-Type": "application/json" } }
)

})