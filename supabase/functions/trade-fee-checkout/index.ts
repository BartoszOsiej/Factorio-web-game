import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface FeePayload {
  feeId: string;
  agreementId: string;
  userId: string;
  username: string;
  amountGrosz: number;
  successUrl?: string;
  cancelUrl?: string;
}

console.info("trade-fee-checkout started");

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async (req, _ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const { feeId, agreementId, userId, username, amountGrosz, successUrl, cancelUrl }: FeePayload = await req.json();

      if (!feeId || !userId || !amountGrosz || amountGrosz <= 0) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card", "blik", "p24"],
        line_items: [{
          price_data: {
            currency: "pln",
            product_data: {
              name: `Trade Hub Fee (5%) - Agreement ${agreementId?.slice(0, 8)}`,
              description: `Service fee for player-to-player trade agreement`,
            },
            unit_amount: amountGrosz,
          },
          quantity: 1,
        }],
        client_reference_id: userId,
        customer_email: `${username?.toLowerCase() ?? "user"}@novactorio.io`,
        metadata: {
          type: "trade_fee",
          fee_id: feeId,
          agreement_id: agreementId ?? "",
          user_id: userId,
        },
        success_url: successUrl ?? "https://factoryworld.mmc29213.workers.dev/?trade=fee_paid",
        cancel_url: cancelUrl ?? "https://factoryworld.mmc29213.workers.dev/?trade=fee_cancelled",
      });

      return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Trade fee checkout error:", err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }),
};
